package main

import (
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "log"
 "net"
 "net/http"
 "net/url"
 "os"
 "os/signal"
 "strings"
 "syscall"
 "time"

 "github.com/jackc/pgx/v5"
 "github.com/jackc/pgx/v5/pgxpool"
 "github.com/segmentio/kafka-go"
 "github.com/seokillseo-byte/index/services/crawler/internal/safefetch"
)

type envelope struct {
 ID string `json:"id"`
 Type string `json:"type"`
 Payload struct { ProjectID string `json:"projectId"` } `json:"payload"`
}
type task struct { ID string; URLID string; URL string; Attempts int }
type fetchResult struct { StatusCode int `json:"statusCode"`; FinalURL string `json:"finalUrl"`; ContentType string `json:"contentType"`; Server string `json:"server"`; RobotsAllowed bool `json:"robotsAllowed"`; Redirects int `json:"redirects"`; Error string `json:"error,omitempty"` }

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
 log.Printf("crawler consumer started; brokers=%v", brokers)
 for {
  msg, err := reader.FetchMessage(ctx)
  if err != nil { if ctx.Err()!=nil { return }; log.Printf("fetch message: %v",err); time.Sleep(time.Second); continue }
  tenantID := string(msg.Key)
  var event envelope
  if err := json.Unmarshal(msg.Value,&event); err != nil { log.Printf("invalid event payload: %v",err); continue }
  if event.Type != "url.batch.accepted" || tenantID == "" || event.Payload.ProjectID == "" {
   log.Printf("skip unsupported or incomplete event %s",event.ID)
   if err := reader.CommitMessages(ctx,msg); err != nil { log.Printf("commit skipped event: %v",err) }
   continue
  }
  if err := processBatch(ctx,pool,tenantID,event.Payload.ProjectID); err != nil {
   log.Printf("batch %s failed; message will be retried: %v",event.ID,err)
   time.Sleep(2*time.Second)
   continue
  }
  if err := reader.CommitMessages(ctx,msg); err != nil { log.Printf("commit event %s: %v",event.ID,err) }
 }
}

func processBatch(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID string) error {
 workerID := env("WORKER_ID", "crawler-"+fmt.Sprint(os.Getpid()))
 for {
  tasks,err:=claimTasks(ctx,pool,tenantID,projectID,workerID,100)
  if err!=nil{return err}
  if len(tasks)==0{return nil}
  for _,item:=range tasks {
   result:=inspect(ctx,item.URL)
   if err:=saveResult(ctx,pool,tenantID,workerID,item,result);err!=nil{return err}
  }
 }
}

func claimTasks(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID,workerID string,limit int)([]task,error){
 tx,err:=pool.Begin(ctx);if err!=nil{return nil,err};defer tx.Rollback(ctx)
 if _,err=tx.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{return nil,err}
 rows,err:=tx.Query(ctx,`WITH due AS (
  SELECT id FROM app.url_processing_tasks
  WHERE tenant_id=$1 AND task_type='http_check'
    AND (status IN ('pending','retrying') OR (status='leased' AND lease_expires_at<now()))
    AND scheduled_at<=now() AND attempt_count<max_attempts
  ORDER BY priority DESC,scheduled_at
  FOR UPDATE SKIP LOCKED LIMIT $4
 )
 UPDATE app.url_processing_tasks t SET status='leased',lease_owner=$3,
  lease_expires_at=now()+interval '2 minutes',attempt_count=t.attempt_count+1,updated_at=now()
 FROM due d,app.urls u
 WHERE t.id=d.id AND u.tenant_id=t.tenant_id AND u.id=t.url_id AND u.project_id=$2
 RETURNING t.id::text,t.url_id::text,u.normalized_url,t.attempt_count`,tenantID,projectID,workerID,limit)
 if err!=nil{return nil,err}
 defer rows.Close()
 var out []task
 for rows.Next(){var t task;if err:=rows.Scan(&t.ID,&t.URLID,&t.URL,&t.Attempts);err!=nil{return nil,err};out=append(out,t)}
 if err:=rows.Err();err!=nil{return nil,err}
 if err:=tx.Commit(ctx);err!=nil{return nil,err}
 return out,nil
}

func inspect(ctx context.Context,raw string)fetchResult{
 result:=fetchResult{FinalURL:raw}
 current:=raw
 client:=safefetch.SafeClient(18*time.Second)
 for hop:=0;hop<=5;hop++{
  parsed,err:=safefetch.ValidateURL(current);if err!=nil{result.Error=err.Error();return result}
  allowed,err:=robotsAllows(ctx,client,parsed)
  if err!=nil{result.Error="robots check failed: "+err.Error();return result}
  result.RobotsAllowed=allowed
  if !allowed{result.Error="disallowed by robots.txt";return result}
  req,err:=http.NewRequestWithContext(ctx,http.MethodHead,parsed.String(),nil);if err!=nil{result.Error=err.Error();return result}
  req.Header.Set("User-Agent","IndexAssistBot/1.0 (+https://index-assist.io.vn/)")
  resp,err:=client.Do(req)
  if err!=nil{result.Error=err.Error();return result}
  result.StatusCode=resp.StatusCode
  result.ContentType=resp.Header.Get("Content-Type")
  result.Server=resp.Header.Get("Server")
  resp.Body.Close()
  if resp.StatusCode>=300&&resp.StatusCode<400{
   location:=resp.Header.Get("Location")
   if location==""{return result}
   next,err:=parsed.Parse(location);if err!=nil{result.Error="invalid redirect location";return result}
   if _,err:=safefetch.ValidateURL(next.String());err!=nil{result.Error="unsafe redirect: "+err.Error();return result}
   current=next.String();result.FinalURL=current;result.Redirects++;continue
  }
  result.FinalURL=parsed.String();return result
 }
 result.Error="redirect limit exceeded";return result
}

func robotsAllows(ctx context.Context,client *http.Client,target *url.URL)(bool,error){
 robotsURL:=*target;robotsURL.Path="/robots.txt";robotsURL.RawQuery="";robotsURL.Fragment=""
 req,err:=http.NewRequestWithContext(ctx,http.MethodGet,robotsURL.String(),nil);if err!=nil{return false,err}
 req.Header.Set("User-Agent","IndexAssistBot/1.0 (+https://index-assist.io.vn/)")
 resp,err:=client.Do(req);if err!=nil{return false,err};defer resp.Body.Close()
 if resp.StatusCode==http.StatusNotFound{return true,nil}
 if resp.StatusCode<200||resp.StatusCode>=300{return false,fmt.Errorf("robots.txt returned HTTP %d",resp.StatusCode)}
 body,err:=io.ReadAll(io.LimitReader(resp.Body,256*1024));if err!=nil{return false,err}
 return parseRobots(string(body),target.EscapedPath()),nil
}

func parseRobots(body,path string)bool{
 lines:=strings.Split(body,"\n");active:=false;rules:=make([][2]string,0)
 for _,line:=range lines{
  line=strings.TrimSpace(strings.SplitN(line,"#",2)[0]);if line==""{continue}
  parts:=strings.SplitN(line,":",2);if len(parts)!=2{continue}
  key,val:=strings.ToLower(strings.TrimSpace(parts[0])),strings.TrimSpace(parts[1])
  if key=="user-agent"{
   agent:=strings.ToLower(val)
   if agent=="*"||strings.Contains(agent,"indexassistbot"){active=true}else{active=false}
   continue
  }
  if active&&(key=="disallow"||key=="allow")&&val!=""{rules=append(rules,[2]string{key,val})}
 }
 bestLen:=-1;allowed:=true
 for _,rule:=range rules{pattern:=rule[1];if strings.HasPrefix(path,pattern)&&len(pattern)>bestLen{bestLen=len(pattern);allowed=rule[0]=="allow"}}
 return allowed
}

func saveResult(ctx context.Context,pool *pgxpool.Pool,tenantID,workerID string,item task,result fetchResult)error{
 tx,err:=pool.Begin(ctx);if err!=nil{return err};defer tx.Rollback(ctx)
 if _,err=tx.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{return err}
 payload,_:=json.Marshal(result)
 if _,err=tx.Exec(ctx,"INSERT INTO app.url_observations(tenant_id,url_id,kind,source,result,confidence) VALUES($1,$2,'http','index-assist-crawler',$3::jsonb,'observed')",tenantID,item.URLID,string(payload));err!=nil{return err}
 status:="eligible";taskStatus:="completed";retry:=false
 if !result.RobotsAllowed||result.StatusCode>=400&&result.StatusCode<500&&result.StatusCode!=429{status="blocked"}
 if result.Error!=""||result.StatusCode==429||result.StatusCode>=500||result.StatusCode==0{
  status="error";retry=true
 }
 if retry{
  if item.Attempts>=8{taskStatus="dead_letter"}else{taskStatus="retrying"}
  if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$3,lease_owner=NULL,lease_expires_at=NULL,scheduled_at=now()+($4::text || ' seconds')::interval,last_error=$5,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$6",item.ID,tenantID,taskStatus,minInt(3600,1<<minInt(item.Attempts,10)),result.Error,workerID);err!=nil{return err}
 }else{
  if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$3,lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$4",item.ID,tenantID,taskStatus,workerID);err!=nil{return err}
 }
 if _,err=tx.Exec(ctx,"UPDATE app.urls SET status=$3,last_checked_at=now(),updated_at=now() WHERE id=$1 AND tenant_id=$2",item.URLID,tenantID,status);err!=nil{return err}
 return tx.Commit(ctx)
}

func minInt(a,b int)int{if a<b{return a};return b}
func env(k,def string)string{if v:=os.Getenv(k);v!=""{return v};return def}
var _ = errors.New
var _ = net.IP{}
var _ = pgx.ErrNoRows
