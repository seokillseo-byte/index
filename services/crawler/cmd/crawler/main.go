package main

import (
 "context"
 "bytes"
 "encoding/json"
 "errors"
  "fmt"
 "hash/fnv"
 "io"
 "log"
  "net/http"
 "net/url"
 "crypto/sha256"
 "os"
 "os/signal"
 "strings"
 "sync"
 "syscall"
 "time"

  "github.com/jackc/pgx/v5/pgxpool"
 "github.com/segmentio/kafka-go"
 "github.com/temoto/robotstxt"
 "golang.org/x/net/html"
 "github.com/seokillseo-byte/index/services/crawler/internal/safefetch"
)

type envelope struct {
 ID string `json:"id"`
 Type string `json:"type"`
 Payload struct { TenantID string `json:"tenantId"`; ProjectID string `json:"projectId"` } `json:"payload"`
}
type task struct { ID string; URLID string; URL string; Attempts int; Type string }
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
 dialer, err := kafkaDialerFromEnv()
 if err != nil { log.Fatalf("Kafka security configuration: %v", err) }
 reader := kafka.NewReader(kafka.ReaderConfig{
  Brokers: brokers, Topic: env("KAFKA_TOPIC", "url.ingestion"),
  GroupID: env("KAFKA_GROUP_ID", "index-assist-crawler-v1"),
  MinBytes: 1, MaxBytes: 10e6, MaxWait: time.Second,
  CommitInterval: 0, StartOffset: kafka.FirstOffset, Dialer: dialer,
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
    var taskErr error
    if item.Type=="html_analysis" { taskErr=analyzeAndSaveHTML(ctx,pool,tenantID,projectID,workerID,item) } else {
     result:=inspect(ctx,item.URL)
     taskErr=saveResult(ctx,pool,tenantID,projectID,workerID,item,result)
    }
    if taskErr!=nil{if item.Type=="html_analysis"{if releaseErr:=markHTMLTask(ctx,pool,tenantID,projectID,workerID,item,"retrying",taskErr.Error());releaseErr!=nil{errCh<-releaseErr}}else{errCh<-taskErr}}
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
 if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks t SET status='dead_letter',lease_owner=NULL,lease_expires_at=NULL,last_error=COALESCE(last_error,'lease expired at maximum attempts'),updated_at=now() FROM app.urls u WHERE t.tenant_id=$1 AND u.tenant_id=t.tenant_id AND u.id=t.url_id AND u.project_id=$2 AND t.task_type IN ('http_check','html_analysis') AND t.status='leased' AND t.lease_expires_at<now() AND t.attempt_count>=t.max_attempts",tenantID,projectID);err!=nil{return nil,err}
 rows,err:=tx.Query(ctx,`WITH due AS (
  SELECT t.id FROM app.url_processing_tasks t JOIN app.urls u ON u.tenant_id=t.tenant_id AND u.id=t.url_id
  WHERE t.tenant_id=$1 AND u.project_id=$2 AND t.task_type IN ('http_check','html_analysis')
    AND (t.status IN ('pending','retrying') OR (t.status='leased' AND (t.lease_expires_at<now() OR t.lease_owner=$3)))
    AND t.scheduled_at<=now() AND t.attempt_count<t.max_attempts
  ORDER BY t.priority DESC,t.scheduled_at
  LIMIT $4 FOR UPDATE OF t SKIP LOCKED
 )
 UPDATE app.url_processing_tasks t SET status='leased',lease_owner=$3,
  lease_expires_at=now()+interval '30 minutes',attempt_count=CASE WHEN t.status='leased' AND t.lease_owner=$3 AND t.lease_expires_at>now() THEN t.attempt_count ELSE t.attempt_count+1 END,updated_at=now()
 FROM due d,app.urls u
 WHERE t.id=d.id AND u.tenant_id=t.tenant_id AND u.id=t.url_id AND u.project_id=$2
 RETURNING t.id::text,t.url_id::text,u.normalized_url,t.attempt_count,t.task_type`,tenantID,projectID,workerID,limit)
 if err!=nil{return nil,err}
 defer rows.Close()
 var out []task
 for rows.Next(){var t task;if err:=rows.Scan(&t.ID,&t.URLID,&t.URL,&t.Attempts,&t.Type);err!=nil{return nil,err};out=append(out,t)}
 if err:=rows.Err();err!=nil{return nil,err}
 if len(out)==0{
  var activeLease bool
  if err:=tx.QueryRow(ctx,"SELECT EXISTS(SELECT 1 FROM app.url_processing_tasks t JOIN app.urls u ON u.tenant_id=t.tenant_id AND u.id=t.url_id WHERE t.tenant_id=$1 AND u.project_id=$2 AND t.task_type IN ('http_check','html_analysis') AND t.status='leased' AND t.lease_expires_at>now())",tenantID,projectID).Scan(&activeLease);err!=nil{return nil,err}
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
 status:="eligible";taskStatus:="completed";retry:=false;retryDelay:=0
 if result.Permanent||(!result.RobotsAllowed&&result.Error=="disallowed by robots.txt"){status="blocked"}
 if result.StatusCode>=400&&result.StatusCode<500&&result.StatusCode!=429{status="blocked"}
 if !result.Permanent&&result.Error!=""&&result.Error!="disallowed by robots.txt"||result.StatusCode==429||result.StatusCode>=500||result.StatusCode==0{status="error";retry=true}
 if retry{
  if item.Attempts>=8{taskStatus="dead_letter"}else{taskStatus="retrying"}
  retryDelay=minInt(3600,1<<minInt(item.Attempts,10))
  if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$3,lease_owner=NULL,lease_expires_at=NULL,scheduled_at=now()+($4::text || ' seconds')::interval,last_error=$5,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$6",item.ID,tenantID,taskStatus,retryDelay,result.Error,workerID);err!=nil{return err}
 }else{
  if _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$3,lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$4",item.ID,tenantID,taskStatus,workerID);err!=nil{return err}
 }
 if _,err=tx.Exec(ctx,"UPDATE app.urls SET status=$3,last_checked_at=now(),updated_at=now() WHERE id=$1 AND tenant_id=$2",item.URLID,tenantID,status);err!=nil{return err}
 if !retry&&status=="eligible"&&strings.Contains(strings.ToLower(result.ContentType),"text/html"){
  htmlKey:="html-analysis:"+item.URLID
  _,err=tx.Exec(ctx,"INSERT INTO app.url_processing_tasks(tenant_id,url_id,task_type,status,priority,idempotency_key) VALUES($1,$2,'html_analysis','pending',4,$3) ON CONFLICT(idempotency_key) DO NOTHING",tenantID,item.URLID,htmlKey)
  if err!=nil{return err}
  _,err=tx.Exec(ctx,"INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key) VALUES($1,'url_task',$2,'url.batch.accepted','url.ingestion',$3,$4::jsonb,$5) ON CONFLICT(idempotency_key) DO NOTHING",tenantID,item.URLID,tenantID+":"+projectID,string(mustJSON(map[string]string{"tenantId":tenantID,"projectId":projectID})),htmlKey)
  if err!=nil{return err}
 }
 if retry&&taskStatus=="retrying"{
  _,err=tx.Exec(ctx,"INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key,next_attempt_at) VALUES($1,'url_task',$2,'url.batch.accepted','url.ingestion',$3,$4::jsonb,$5,now()+(($6::text || ' seconds')::interval + interval '5 seconds')) ON CONFLICT(idempotency_key) DO NOTHING",tenantID,item.ID,tenantID+":"+projectID,string(mustJSON(map[string]string{"tenantId":tenantID,"projectId":projectID})),fmt.Sprintf("retry-task:%s:%d",item.ID,item.Attempts),retryDelay)
  if err!=nil{return err}
 }
 return tx.Commit(ctx)
}


type discoveredLink struct { TargetURL string; Anchor string; Rel []string; LinkType string }

func canonicalURL(raw string)(string,error){
 u,err:=url.Parse(strings.TrimSpace(raw));if err!=nil{return "",err}
 if u.Scheme!="http"&&u.Scheme!="https"{return "",errors.New("unsupported link scheme")}
 if u.Hostname()==""||u.User!=nil{return "",errors.New("invalid link URL")}
 u.Scheme=strings.ToLower(u.Scheme)
 host:=strings.TrimSuffix(strings.ToLower(u.Hostname()),".");port:=u.Port()
 if strings.Contains(host,":"){host="["+host+"]"}
 if port!=""&&!((u.Scheme=="https"&&port=="443")||(u.Scheme=="http"&&port=="80")){host+=":"+port}
 u.Host=host;if u.Path==""{u.Path="/"}
 u.Fragment="";return u.String(),nil
}

func analyzeAndSaveHTML(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID,workerID string,item task)error{
 tx,err:=pool.Begin(ctx);if err!=nil{return err}
 if _,err=tx.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{tx.Rollback(ctx);return err}
 var owned bool;var targetURL string
 err=tx.QueryRow(ctx,"SELECT EXISTS(SELECT 1 FROM app.url_processing_tasks WHERE id=$1 AND tenant_id=$2 AND status='leased' AND lease_owner=$3),COALESCE((SELECT target_url FROM app.projects WHERE tenant_id=$2 AND id=$4),'')",item.ID,tenantID,workerID,projectID).Scan(&owned,&targetURL)
 if err!=nil{tx.Rollback(ctx);return err}
 if !owned{return tx.Commit(ctx)}
 if targetURL==""{
  _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status='completed',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$3",item.ID,tenantID,workerID)
  if err!=nil{tx.Rollback(ctx);return err};return tx.Commit(ctx)
 }
 if err=tx.Commit(ctx);err!=nil{return err}
 targetCanonical,err:=canonicalURL(targetURL);if err!=nil{return err}
 parsed,err:=safefetch.ValidateURL(item.URL);if err!=nil{return err}
 client:=safefetch.SafeClient(20*time.Second);current:=parsed
 var body []byte;finalURL:=item.URL;statusCode:=0
 for hop:=0;hop<=5;hop++{
  allowed,robotsErr:=robotsAllows(ctx,client,current);if robotsErr!=nil{return robotsErr};if !allowed{return markHTMLTask(ctx,pool,tenantID,projectID,workerID,item,"completed","disallowed by robots.txt")}
  req,reqErr:=http.NewRequestWithContext(ctx,http.MethodGet,current.String(),nil);if reqErr!=nil{return reqErr}
  req.Header.Set("User-Agent","IndexAssistBot/1.0 (+https://index-assist.io.vn/)")
  req.Header.Set("Range","bytes=0-2097151")
  resp,fetchErr:=client.Do(req);if fetchErr!=nil{return fetchErr}
  if resp.StatusCode>=300&&resp.StatusCode<400{
   location:=resp.Header.Get("Location");resp.Body.Close();if location==""{return errors.New("HTML redirect without Location")}
   next,parseErr:=current.Parse(location);if parseErr!=nil{return parseErr}
   if _,validateErr:=safefetch.ValidateURL(next.String());validateErr!=nil{return validateErr}
   current=next;continue
  }
  statusCode=resp.StatusCode;finalURL=current.String()
  if statusCode<200||statusCode>=300{resp.Body.Close();return markHTMLTask(ctx,pool,tenantID,projectID,workerID,item,"retrying",fmt.Sprintf("HTML fetch returned HTTP %d",statusCode))}
  if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")),"text/html"){resp.Body.Close();return markHTMLTask(ctx,pool,tenantID,projectID,workerID,item,"completed","non-HTML content")}
  body,err=io.ReadAll(io.LimitReader(resp.Body,2*1024*1024+1));resp.Body.Close();if err!=nil{return err}
  if len(body)>2*1024*1024{body=body[:2*1024*1024]}
  break
 }
 if statusCode==0{return errors.New("HTML redirect limit exceeded")}
 links,err:=extractBacklinks(body,finalURL,targetCanonical);if err!=nil{return err}
 save,err:=pool.Begin(ctx);if err!=nil{return err};defer save.Rollback(ctx)
 if _,err=save.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{return err}
 var stillOwned bool
 if err=save.QueryRow(ctx,"SELECT EXISTS(SELECT 1 FROM app.url_processing_tasks WHERE id=$1 AND tenant_id=$2 AND status='leased' AND lease_owner=$3)",item.ID,tenantID,workerID).Scan(&stillOwned);err!=nil{return err}
 if !stillOwned{return save.Commit(ctx)}
 for _,link:=range links{
  hash:=sha256.Sum256([]byte(link.TargetURL))
  _,err=save.Exec(ctx, "INSERT INTO app.backlink_discoveries(tenant_id,project_id,source_url_id,target_url,target_url_hash,anchor_text,rel_attributes,link_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,source_url_id,target_url_hash,anchor_text) DO UPDATE SET rel_attributes=EXCLUDED.rel_attributes,link_type=EXCLUDED.link_type,last_seen_at=now(),occurrence_count=app.backlink_discoveries.occurrence_count+1",tenantID,projectID,item.URLID,link.TargetURL,hash[:],link.Anchor,link.Rel,link.LinkType)
  if err!=nil{return err}
 }
 result:=mustJSON(map[string]any{"targetUrl":targetCanonical,"sourceUrl":finalURL,"backlinksFound":len(links),"httpStatus":statusCode,"contentBytes":len(body)})
 if _,err=save.Exec(ctx,"INSERT INTO app.url_observations(tenant_id,url_id,kind,source,result,confidence) VALUES($1,$2,'backlink','index-assist-html-analyzer',$3::jsonb,'observed')",tenantID,item.URLID,string(result));err!=nil{return err}
 if _,err=save.Exec(ctx,"UPDATE app.url_processing_tasks SET status='completed',lease_owner=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$3",item.ID,tenantID,workerID);err!=nil{return err}
 return save.Commit(ctx)
}

func extractBacklinks(body []byte,baseURL,targetCanonical string)([]discoveredLink,error){
 z:=html.NewTokenizer(bytes.NewReader(body))
 var links []discoveredLink;inAnchor:=false;anchor:="";href:="";rel:=[]string{}
 for{
  tt:=z.Next()
  switch tt{
  case html.ErrorToken:
   if z.Err()!=io.EOF{return nil,z.Err()};return links,nil
  case html.StartTagToken,html.SelfClosingTagToken:
   name,hasAttr:=z.TagName()
   if string(name)=="a"{
    inAnchor=true;anchor="";href="";rel=make([]string,0)
    for hasAttr{k,v,more:=z.TagAttr();key:=strings.ToLower(string(k));value:=string(v);if key=="href"{href=value};if key=="rel"{for _,part:=range strings.Fields(strings.ToLower(value)){rel=append(rel,part)}};hasAttr=more}
    if tt==html.SelfClosingTagToken{inAnchor=false}
   }
  case html.TextToken:
   if inAnchor{anchor+=string(z.Text());if len(anchor)>512{anchor=anchor[:512]}}
  case html.EndTagToken:
   name,_:=z.TagName()
   if string(name)=="a"&&inAnchor{
    inAnchor=false
    if href!=""{
     base,err:=url.Parse(baseURL);if err==nil{ref,parseErr:=url.Parse(strings.TrimSpace(href));if parseErr==nil{resolved:=base.ResolveReference(ref);canonical,canonErr:=canonicalURL(resolved.String());if canonErr==nil&&canonical==targetCanonical{
      kind:="follow";hasNoFollow:=false;for _,v:=range rel{if v=="nofollow"{hasNoFollow=true};if v=="sponsored"{kind="sponsored"};if v=="ugc"{kind="ugc"}}
      if hasNoFollow&&kind=="follow"{kind="nofollow"};links=append(links,discoveredLink{TargetURL:canonical,Anchor:strings.TrimSpace(anchor),Rel:rel,LinkType:kind})
     }}}
    }
   }
  }
 }
}

func markHTMLTask(ctx context.Context,pool *pgxpool.Pool,tenantID,projectID,workerID string,item task,status,message string)error{
 tx,err:=pool.Begin(ctx);if err!=nil{return err};defer tx.Rollback(ctx)
 if _,err=tx.Exec(ctx,"SELECT set_config('app.tenant_id',$1,true)",tenantID);err!=nil{return err}
 if status=="retrying"&&item.Attempts<8{
  delay:=minInt(3600,1<<minInt(item.Attempts,10))
  _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status='retrying',scheduled_at=now()+($4::text || ' seconds')::interval,lease_owner=NULL,lease_expires_at=NULL,last_error=$5,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$3",item.ID,tenantID,workerID,delay,message)
 }else{
  finalStatus:=status;if status=="retrying"{finalStatus="dead_letter"}
  _,err=tx.Exec(ctx,"UPDATE app.url_processing_tasks SET status=$4,lease_owner=NULL,lease_expires_at=NULL,last_error=$5,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$3",item.ID,tenantID,workerID,finalStatus,message)
 }
 if err!=nil{return err}
 if status=="retrying"&&item.Attempts<8{
  delay:=minInt(3600,1<<minInt(item.Attempts,10))
  _,err=tx.Exec(ctx,"INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key,next_attempt_at) VALUES($1,'url_task',$2,'url.batch.accepted','url.ingestion',$3,$4::jsonb,$5,now()+(($6::text || ' seconds')::interval + interval '5 seconds')) ON CONFLICT(idempotency_key) DO NOTHING",tenantID,item.ID,tenantID+":"+projectID,string(mustJSON(map[string]string{"tenantId":tenantID,"projectId":projectID})),fmt.Sprintf("retry-html:%s:%d",item.ID,item.Attempts),delay)
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
