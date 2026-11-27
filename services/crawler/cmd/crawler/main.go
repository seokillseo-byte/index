package main

import (
 "context"
 "encoding/json"
 "errors"
  "fmt"
 "hash/fnv"
 "io"
 "log"
  "net/http"
 "net/url"
 "os"
 "os/signal"
 "strings"
 "sync"
 "syscall"
 "time"

  "github.com/jackc/pgx/v5/pgxpool"
 "github.com/segmentio/kafka-go"
 "github.com/temoto/robotstxt"
 "github.com/seokillseo-byte/index/services/crawler/internal/safefetch"
)

type envelope struct {
 ID string `json:"id"`
 Type string `json:"type"`
 Payload struct { TenantID string `json:"tenantId"`; ProjectID string `json:"projectId"` } `json:"payload"`
}
type task struct { ID string; URLID string; URL string; Attempts int }
var hostLocks [256]sync.Mutex

type fetchResult struct { StatusCode int `json:"statusCode"`; FinalURL string `json:"finalUrl"`; ContentType string `json:"contentType"`; Server string `json:"server"`; RobotsAllowed bool `json:"robotsAllowed"`; Redirects int `json:"redirects"`; Error string `json:"error,omitempty"`; Permanent bool `json:"permanent,omitempty"` }

func main() {
 ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
 defer stop()
 databaseURL := os.Getenv("DATABASE_URL")
 brokers := strings.Split(env("KAFKA_BROKERS", "redpanda:9092"), ",")
 if databaseURL == "" { log.Fatal("DATABASE_URL is required") }
 pool, err := pgxpool.New(ctx, databaseURL)
 if err != nil { log.Fatal(err) }
 defer pool.Close()
 if err := pool.Ping(ctx); err != nil { log.Fatal(err) }
 reader := kafka.NewReader(kafka.ReaderConfig{
  Brokers: brokers, Topic: env("KAFKA_TOPIC", "url.ingestion"),
  GroupID: env("KAFKA_GROUP_ID", "index-assist-crawler-v1"),
  MinBytes: 1, MaxBytes: 10e6, MaxWait: time.Second,
  CommitInterval: 0, StartOffset: kafka.FirstOffset,
 })
 defer reader.Close()
 startHealthServer(ctx,pool)
 log.Printf("crawler consumer started; brokers=%v", brokers)
 for {
  msg, err := reader.FetchMessage(ctx)
  if err != nil { if ctx.Err()!=nil { return }; log.Printf("fetch message: %v",err); time.Sleep(time.Second); continue }
  var event envelope
  if err := json.Unmarshal(msg.Value,&event); err != nil { log.Printf("invalid event payload: %v",err); if commitErr:=reader.CommitMessages(ctx,msg);commitErr!=nil{log.Printf("commit malformed event: %v",commitErr)}; continue }
  if event.Type != "url.batch.accepted" || event.Payload.TenantID == "" || event.Payload.ProjectID == "" {
   log.Printf("skip unsupported or incomplete event %s",event.ID)
   if err := reader.CommitMessages(ctx,msg); err != nil { log.Printf("commit skipped event: %v",err) }
   continue
  }
  for {
   err=processBatch(ctx,pool,event.Payload.TenantID,event.Payload.ProjectID)
   if err==nil{break}
   log.Printf("batch %s processing failed; retrying same event: %v",event.ID,err)
   select{case <-ctx.Done():return;case <-time.After(2*time.Second):}
  }
  if err := reader.CommitMessages(ctx,msg); err != nil { log.Printf("commit event %s: %v",event.ID,err) }
 }
}

func processBatch(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID string) error {
 host,_:=os.Hostname()
 workerID := env("WORKER_ID", "crawler-"+host+"-"+fmt.Sprint(os.Getpid()))
 for {
  tasks,err:=claimTasks(ctx,pool,tenantID,projectID,workerID,100)
  if err!=nil{return err}
  if len(tasks)==0{return nil}
  var wg sync.WaitGroup
  sem:=make(chan struct{},16)
  errCh:=make(chan error,len(tasks))
  for _,item:=range tasks {
   item:=item
   wg.Add(1)
   go func(){
    defer wg.Done()
    select{case sem<-struct{}{}:case <-ctx.Done():errCh<-ctx.Err();return}
    defer func(){<-sem}()
    parsedURL,parseErr:=url.Parse(item.URL)
    if parseErr!=nil{errCh<-parseErr;return}
    lock:=hostMutex(parsedURL.Hostname())
    lock.Lock()
    defer lock.Unlock()
    result:=inspect(ctx,item.URL)
    if err:=saveResult(ctx,pool,tenantID,projectID,workerID,item,result);err!=nil{errCh<-err}
   }()
  }
  wg.Wait()
  close(errCh)
  for err:=range errCh{if err!=nil{return err}}
 }
}

func claimTasks(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID,workerID string,limit int)([]task,error){
 tx,err:=pool.Begin(ctx);if err!=nil{return nil,err};defer tx.Rollback(ctx)
 if _,err=tx.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{return nil,err}
 if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks t SET status='dead_letter',lease_owner=NULL,lease_expires_at=NULL,last_error=COALESCE(last_error,'lease expired at maximum attempts'),updated_at=now() FROM app.urls u WHERE t.tenant_id=$1 AND u.tenant_id=t.tenant_id AND u.id=t.url_id AND u.project_id=$2 AND t.task_type='http_check' AND t.status='leased' AND t.lease_expires_at<now() AND t.attempt_count>=t.max_attempts",tenantID,projectID);err!=nil{return nil,err}
 rows,err:=tx.Query(ctx,`WITH due AS (
  SELECT t.id FROM app.url_processing_tasks t JOIN app.urls u ON u.tenant_id=t.tenant_id AND u.id=t.url_id
  WHERE t.tenant_id=$1 AND u.project_id=$2 AND t.task_type='http_check'
    AND (t.status IN ('pending','retrying') OR (t.status='leased' AND (t.lease_expires_at<now() OR t.lease_owner=$3)))
    AND t.scheduled_at<=now() AND t.attempt_count<t.max_attempts
  ORDER BY t.priority DESC,t.scheduled_at
  LIMIT $4 FOR UPDATE OF t SKIP LOCKED
 )
 UPDATE app.url_processing_tasks t SET status='leased',lease_owner=$3,
  lease_expires_at=now()+interval '30 minutes',attempt_count=CASE WHEN t.status='leased' AND t.lease_owner=$3 AND t.lease_expires_at>now() THEN t.attempt_count ELSE t.attempt_count+1 END,updated_at=now()
 FROM due d,app.urls u
 WHERE t.id=d.id AND u.tenant_id=t.tenant_id AND u.id=t.url_id AND u.project_id=$2
 RETURNING t.id::text,t.url_id::text,u.normalized_url,t.attempt_count`,tenantID,projectID,workerID,limit)
 if err!=nil{return nil,err}
 defer rows.Close()
 var out []task
 for rows.Next(){var t task;if err:=rows.Scan(&t.ID,&t.URLID,&t.URL,&t.Attempts);err!=nil{return nil,err};out=append(out,t)}
 if err:=rows.Err();err!=nil{return nil,err}
 if len(out)==0{
  var activeLease bool
  if err:=tx.QueryRow(ctx,"SELECT EXISTS(SELECT 1 FROM app.url_processing_tasks t JOIN app.urls u ON u.tenant_id=t.tenant_id AND u.id=t.url_id WHERE t.tenant_id=$1 AND u.project_id=$2 AND t.task_type='http_check' AND t.status='leased' AND t.lease_expires_at>now())",tenantID,projectID).Scan(&activeLease);err!=nil{return nil,err}
  if activeLease{return nil,errors.New("tasks are leased by another crawler replica")}
 }
 if err:=tx.Commit(ctx);err!=nil{return nil,err}
 return out,nil
}

func inspect(ctx context.Context,raw string)fetchResult{
 result:=fetchResult{FinalURL:raw}
 current:=raw
 client:=safefetch.SafeClient(18*time.Second)
 for hop:=0;hop<=5;hop++{
  parsed,err:=safefetch.ValidateURL(current);if err!=nil{result.Error=err.Error();result.Permanent=true;return result}
  allowed,err:=robotsAllows(ctx,client,parsed)
  if err!=nil{result.Error="robots check failed: "+err.Error();result.Permanent=strings.Contains(err.Error(),"non-public IP");return result}
  result.RobotsAllowed=allowed
  if !allowed{result.Error="disallowed by robots.txt";result.Permanent=true;return result}
  req,err:=http.NewRequestWithContext(ctx,http.MethodHead,parsed.String(),nil);if err!=nil{result.Error=err.Error();return result}
  req.Header.Set("User-Agent","IndexAssistBot/1.0 (+https://index-assist.io.vn/)")
  resp,err:=client.Do(req)
  if err!=nil{result.Error=err.Error();result.Permanent=strings.Contains(err.Error(),"non-public IP");return result}
  if resp.StatusCode==http.StatusMethodNotAllowed||resp.StatusCode==http.StatusNotImplemented{
   resp.Body.Close()
   fallback,reqErr:=http.NewRequestWithContext(ctx,http.MethodGet,parsed.String(),nil)
   if reqErr!=nil{result.Error=reqErr.Error();return result}
   fallback.Header.Set("User-Agent","IndexAssistBot/1.0 (+https://index-assist.io.vn/)")
   fallback.Header.Set("Range","bytes=0-0")
   resp,err=client.Do(fallback)
   if err!=nil{result.Error=err.Error();return result}
  }
  result.StatusCode=resp.StatusCode
  result.ContentType=resp.Header.Get("Content-Type")
  result.Server=resp.Header.Get("Server")
  resp.Body.Close()
  if resp.StatusCode>=300&&resp.StatusCode<400{
   location:=resp.Header.Get("Location")
   if location==""{return result}
   next,err:=parsed.Parse(location);if err!=nil{result.Error="invalid redirect location";result.Permanent=true;return result}
   if _,err:=safefetch.ValidateURL(next.String());err!=nil{result.Error="unsafe redirect: "+err.Error();result.Permanent=true;return result}
   current=next.String();result.FinalURL=current;result.Redirects++;continue
  }
  result.FinalURL=parsed.String();return result
 }
 result.Error="redirect limit exceeded";result.Permanent=true;return result
}

func robotsAllows(ctx context.Context,client *http.Client,target *url.URL)(bool,error){
 current:=*target
 for hop:=0;hop<=5;hop++{
  robotsURL:=current
  robotsURL.Path="/robots.txt";robotsURL.RawQuery="";robotsURL.Fragment=""
  req,err:=http.NewRequestWithContext(ctx,http.MethodGet,robotsURL.String(),nil);if err!=nil{return false,err}
  req.Header.Set("User-Agent","IndexAssistBot/1.0 (+https://index-assist.io.vn/)")
  resp,err:=client.Do(req);if err!=nil{return false,err}
  if resp.StatusCode>=300&&resp.StatusCode<400{
   location:=resp.Header.Get("Location");resp.Body.Close()
   if location==""{return false,errors.New("robots redirect has no Location")}
   next,parseErr:=robotsURL.Parse(location);if parseErr!=nil{return false,parseErr}
   if _,validateErr:=safefetch.ValidateURL(next.String());validateErr!=nil{return false,validateErr}
   current=*next;continue
  }
  if resp.StatusCode==http.StatusNotFound||resp.StatusCode==http.StatusGone{resp.Body.Close();return true,nil}
  if resp.StatusCode==http.StatusUnauthorized||resp.StatusCode==http.StatusForbidden{resp.Body.Close();return false,nil}
  if resp.StatusCode==http.StatusTooManyRequests||resp.StatusCode>=500{status:=resp.StatusCode;resp.Body.Close();return false,fmt.Errorf("robots.txt returned HTTP %d",status)}
  if resp.StatusCode>=400&&resp.StatusCode<500{resp.Body.Close();return true,nil}
  if resp.StatusCode<200||resp.StatusCode>=300{status:=resp.StatusCode;resp.Body.Close();return false,fmt.Errorf("robots.txt returned HTTP %d",status)}
  body,readErr:=io.ReadAll(io.LimitReader(resp.Body,256*1024));resp.Body.Close()
  if readErr!=nil{return false,readErr}
  return parseRobots(string(body),target.EscapedPath()),nil
 }
 return false,errors.New("robots redirect limit exceeded")
}

func parseRobots(body,path string)bool{
 data,err:=robotstxt.FromBytes([]byte(body))
 if err!=nil{return false}
 group:=data.FindGroup("IndexAssistBot")
 if group==nil{return false}
 return group.Test(path)
}

func saveResult(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID,workerID string,item task,result fetchResult)error{
 tx,err:=pool.Begin(ctx);if err!=nil{return err};defer tx.Rollback(ctx)
 if _,err=tx.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{return err}
 var owned bool
 if err=tx.QueryRow(ctx,"SELECT EXISTS(SELECT 1 FROM app.url_processing_tasks WHERE id=$1 AND tenant_id=$2 AND status='leased' AND lease_owner=$3)",item.ID,tenantID,workerID).Scan(&owned);err!=nil{return err}
 if !owned{return tx.Commit(ctx)}
 payload,_:=json.Marshal(result)
 if _,err=tx.Exec(ctx,"INSERT INTO app.url_observations(tenant_id,url_id,kind,source,result,confidence) VALUES($1,$2,'http','index-assist-crawler',$3::jsonb,'observed')",tenantID,item.URLID,string(payload));err!=nil{return err}
 status:="eligible";taskStatus:="completed";retry:=false
 if result.Permanent||(!result.RobotsAllowed&&result.Error=="disallowed by robots.txt"){status="blocked"}
 if result.StatusCode>=400&&result.StatusCode<500&&result.StatusCode!=429{status="blocked"}
 if !result.Permanent&&result.Error!=""&&result.Error!="disallowed by robots.txt"||result.StatusCode==429||result.StatusCode>=500||result.StatusCode==0{status="error";retry=true}
 if retry{
  if item.Attempts>=8{taskStatus="dead_letter"}else{taskStatus="retrying"}
  retryDelay:=minInt(3600,1<<minInt(item.Attempts,10))
  if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$3,lease_owner=NULL,lease_expires_at=NULL,scheduled_at=now()+($4::text || ' seconds')::interval,last_error=$5,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$6",item.ID,tenantID,taskStatus,retryDelay,result.Error,workerID);err!=nil{return err}
 }else{
  if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$3,lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$4",item.ID,tenantID,taskStatus,workerID);err!=nil{return err}
 }
 if _,err=tx.Exec(ctx,"UPDATE app.urls SET status=$3,last_checked_at=now(),updated_at=now() WHERE id=$1 AND tenant_id=$2",item.URLID,tenantID,status);err!=nil{return err}
 if retry&&taskStatus=="retrying"{
  _,err=tx.Exec(ctx,"INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key,next_attempt_at) VALUES($1,'url_task',$2,'url.batch.accepted','url.ingestion',$3,$4::jsonb,$5,now()+(($6::text || ' seconds')::interval + interval '5 seconds')) ON CONFLICT(idempotency_key) DO NOTHING",tenantID,item.ID,tenantID+':'+projectID,string(mustJSON(map[string]string{"tenantId":tenantID,"projectId":projectID})),fmt.Sprintf("retry-task:%s:%d",item.ID,item.Attempts),retryDelay)
  if err!=nil{return err}
 }
 return tx.Commit(ctx)
}

func hostMutex(host string)*sync.Mutex{h:=fnv.New32a();_,_=h.Write([]byte(strings.ToLower(host)));return &hostLocks[h.Sum32()%uint32(len(hostLocks))]}
func mustJSON(v any)[]byte{b,_:=json.Marshal(v);return b}
func minInt(a,b int)int{if a<b{return a};return b}
func env(k,def string)string{if v:=os.Getenv(k);v!=""{return v};return def}

func startHealthServer(ctx context.Context,pool *pgxpool.Pool){
 mux:=http.NewServeMux()
 mux.HandleFunc("GET /health/live",func(w http.ResponseWriter,_ *http.Request){w.Header().Set("Content-Type","application/json");_,_=io.WriteString(w,`{"status":"ok"}`)})
 mux.HandleFunc("GET /health/ready",func(w http.ResponseWriter,r *http.Request){checkCtx,cancel:=context.WithTimeout(r.Context(),2*time.Second);defer cancel();if err:=pool.Ping(checkCtx);err!=nil{w.WriteHeader(http.StatusServiceUnavailable);_,_=io.WriteString(w,`{"status":"not_ready"}`);return};w.Header().Set("Content-Type","application/json");_,_=io.WriteString(w,`{"status":"ready"}`)})
 server:=&http.Server{Addr:":"+env("PORT","8080"),Handler:mux,ReadHeaderTimeout:5*time.Second,ReadTimeout:10*time.Second,WriteTimeout:10*time.Second,IdleTimeout:30*time.Second}
 go func(){if err:=server.ListenAndServe();err!=nil&&err!=http.ErrServerClosed{log.Printf("health server: %v",err)}}()
 go func(){<-ctx.Done();shutdownCtx,cancel:=context.WithTimeout(context.Background(),5*time.Second);defer cancel();_=server.Shutdown(shutdownCtx)}()
}
