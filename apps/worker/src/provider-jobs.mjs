import pg from 'pg';
import {Kafka} from 'kafkajs';
import {createDecipheriv,createCipheriv,randomBytes,randomUUID} from 'node:crypto';

const {Pool}=pg;
const required=['PROVIDER_DATABASE_URL','KAFKA_BROKERS','INTEGRATION_ENCRYPTION_KEY'];
for(const key of required)if(!process.env[key])throw new Error(key+' is required');
if(!/^[a-fA-F0-9]{64}$/.test(process.env.INTEGRATION_ENCRYPTION_KEY))throw new Error('INTEGRATION_ENCRYPTION_KEY must be 32-byte hex');
const key=Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY,'hex');
const pool=new Pool({connectionString:process.env.PROVIDER_DATABASE_URL,max:12,application_name:'index-assist-provider-worker'});
const kafka=new Kafka({clientId:'index-assist-provider-worker',brokers:process.env.KAFKA_BROKERS.split(',').map(x=>x.trim()),connectionTimeout:5000,requestTimeout:30000});
const consumer=kafka.consumer({groupId:process.env.PROVIDER_KAFKA_GROUP_ID||'index-assist-provider-v1',allowAutoTopicCreation:false});
const topic=process.env.PROVIDER_KAFKA_TOPIC||'provider.jobs';
const workerId='provider-'+randomUUID();
let stopping=false;

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function decrypt(row){
 const decipher=createDecipheriv('aes-256-gcm',key,row.iv);decipher.setAuthTag(row.auth_tag);
 return JSON.parse(Buffer.concat([decipher.update(row.ciphertext),decipher.final()]).toString('utf8'));
}
function encrypt(value){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {iv,ciphertext,authTag:cipher.getAuthTag()};
}
async function tenantTransaction(tenantId,fn){
 const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);const result=await fn(client);await client.query('COMMIT');return result;}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function getCredential(tenantId,connectionId,provider){
 return tenantTransaction(tenantId,async client=>{
  const c=await client.query("SELECT status FROM app.integration_connections WHERE tenant_id=$1 AND id=$2 AND provider=$3",[tenantId,connectionId,provider]);
  if(!c.rowCount||c.rows[0].status!=='connected')throw new Error('Provider connection is no longer active');
  const r=await client.query("SELECT ciphertext,iv,auth_tag FROM app.integration_secrets WHERE tenant_id=$1 AND connection_id=$2",[tenantId,connectionId]);
  if(!r.rowCount)throw new Error('Provider credentials are missing');
  return decrypt(r.rows[0]);
 });
}
async function refreshAccessToken(tenantId,connectionId,provider,credential){
 if(credential.apiKey)return credential;
 const expires=Date.parse(credential.expiresAt||'1970-01-01T00:00:00Z');
 if(credential.accessToken&&expires>Date.now()+5*60_000)return credential;
 const prefix=provider==='google_search_console'?'GOOGLE':'BING';
 const clientId=process.env[prefix+'_OAUTH_CLIENT_ID'],clientSecret=process.env[prefix+'_OAUTH_CLIENT_SECRET'];
 const tokenUrl=provider==='google_search_console'?'https://oauth2.googleapis.com/token':'https://www.bing.com/webmasters/oauth/token';
 if(!clientId||!clientSecret||!credential.refreshToken)throw new Error('Provider token expired; reconnect the account');
 const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:credential.refreshToken,grant_type:'refresh_token'});
 const response=await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body,signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw new Error('Provider token refresh failed with HTTP '+response.status);
 const next={...credential,accessToken:data.access_token,refreshToken:data.refresh_token||credential.refreshToken,expiresAt:new Date(Date.now()+Math.max(60,Number(data.expires_in)||3600)*1000).toISOString(),scope:data.scope||credential.scope};
 const encrypted=encrypt(next);
 await tenantTransaction(tenantId,client=>client.query("UPDATE app.integration_secrets SET ciphertext=$3,iv=$4,auth_tag=$5,updated_at=now() WHERE tenant_id=$1 AND connection_id=$2",[tenantId,connectionId,encrypted.ciphertext,encrypted.iv,encrypted.authTag]));
 return next;
}
async function claimBatch(payload){
 const limit=payload.provider==='bing_webmaster'?500:10;
 return tenantTransaction(payload.tenantId,async client=>{
  const result=await client.query(
   "WITH due AS (SELECT id FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND provider=$4 AND action=CASE WHEN $4='google_search_console' THEN 'inspect' ELSE 'submit_url' END AND ((status IN ('queued','retrying') AND scheduled_at<=now()) OR (status='leased' AND lease_expires_at<now())) ORDER BY created_at LIMIT $5 FOR UPDATE SKIP LOCKED) UPDATE app.provider_jobs j SET status='leased',lease_owner=$6,lease_expires_at=now()+interval '10 minutes',attempt_count=j.attempt_count+1,updated_at=now() FROM due WHERE j.tenant_id=$1 AND j.id=due.id RETURNING j.id,j.url,j.site_url,j.action,j.attempt_count,j.max_attempts",
   [payload.tenantId,payload.projectId,payload.connectionId,payload.provider,limit,workerId],
  );
  if(!result.rowCount){
   const active=await client.query("SELECT min(lease_expires_at) expiry FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND status='leased' AND lease_expires_at>now()",[payload.tenantId,payload.projectId,payload.connectionId]);
   if(active.rows[0]?.expiry){
    const expiry=new Date(active.rows[0].expiry);
    const eventKey='provider-lease-recover:'+payload.connectionId+':'+Math.floor(expiry.getTime()/60000);
    await client.query("INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key,next_attempt_at) VALUES($1,'provider_batch',$2,'provider.jobs.retry','provider.jobs',$3,$4::jsonb,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING",[payload.tenantId,payload.projectId,payload.tenantId+':'+payload.projectId+':'+payload.connectionId,JSON.stringify(payload),eventKey,new Date(expiry.getTime()+5000)]);
   }
  }
  return result.rows;
 });
}
async function scheduleRetry(tenantId,payload,job,error,retryable){
 return tenantTransaction(tenantId,async client=>{
  const dead=!retryable||Number(job.attempt_count)>=Number(job.max_attempts);
  const attempts=Number(job.attempt_count);
  const seconds=Math.min(3600,2**Math.min(attempts,10));
  const status=dead?'dead_letter':'retrying';
  await client.query("UPDATE app.provider_jobs SET status=$4,scheduled_at=CASE WHEN $4='retrying' THEN now()+($5::text || ' seconds')::interval ELSE scheduled_at END,lease_owner=NULL,lease_expires_at=NULL,last_error=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND lease_owner=$3",[tenantId,job.id,workerId,status,seconds,String(error).slice(0,2000)]);
  if(!dead){
   const key='provider-retry:'+job.id+':'+attempts;
   await client.query("INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key,next_attempt_at) VALUES($1,'provider_job',$2,'provider.jobs.retry','provider.jobs',$3,$4::jsonb,$5,now()+(($6::text || ' seconds')::interval + interval '5 seconds')) ON CONFLICT(idempotency_key) DO NOTHING",[tenantId,job.id,tenantId+':'+payload.projectId+':'+payload.connectionId,JSON.stringify(payload),key,seconds]);
  }
 });
}
async function markConnectionError(tenantId,connectionId,message){
 await tenantTransaction(tenantId,client=>client.query("UPDATE app.integration_connections SET status='error',updated_at=now() WHERE tenant_id=$1 AND id=$2",[tenantId,connectionId]));
 console.error('Provider connection requires attention',connectionId,message);
}
async function processGoogle(payload,jobs,credential){
 for(const job of jobs){
  try{
   const response=await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',{method:'POST',headers:{authorization:'Bearer '+credential.accessToken,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({inspectionUrl:job.url,siteUrl:job.site_url,languageCode:'en-US'}),signal:AbortSignal.timeout(20000)});
   const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={error:{message:'Invalid Google response'}};}
   if(!response.ok){await scheduleRetry(payload.tenantId,payload,job,'Google URL Inspection HTTP '+response.status+': '+JSON.stringify(data).slice(0,500),response.status===408||response.status===429||response.status>=500);continue;}
   await tenantTransaction(payload.tenantId,async client=>{
    const result=data.inspectionResult||data;
    await client.query("UPDATE app.provider_jobs SET status='completed',response_code=$4,provider_result=$5::jsonb,last_error=NULL,lease_owner=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND lease_owner=$3",[payload.tenantId,job.id,workerId,response.status,JSON.stringify(result)]);
    await client.query("INSERT INTO app.url_observations(tenant_id,url_id,kind,source,result,confidence) SELECT $1,u.id,'index','google-search-console-url-inspection',$4::jsonb,'verified' FROM app.urls u WHERE u.tenant_id=$1 AND u.project_id=$2 AND u.normalized_url=$3",[payload.tenantId,payload.projectId,job.url,JSON.stringify(result)]);
   });
  }catch(error){await scheduleRetry(payload.tenantId,payload,job,error,true);}
 }
}
async function processBing(payload,jobs,credential){
 if(!jobs.length)return;
 try{
  const endpoint=new URL('https://www.bing.com/webmaster/api.svc/json/SubmitUrlBatch');
  endpoint.searchParams.set('siteUrl',jobs[0].site_url);
  const headers={'content-type':'application/json','accept':'application/json'};
  if(credential.apiKey)endpoint.searchParams.set('apikey',credential.apiKey);else headers.authorization='Bearer '+credential.accessToken;
  const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({siteUrl:jobs[0].site_url,urlList:jobs.map(j=>j.url)}),signal:AbortSignal.timeout(20000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={raw:text.slice(0,500)};}
  const apiError=Boolean(data?.ErrorCode||data?.d?.ErrorCode);
  if(!response.ok||apiError){
   const retryable=response.status===408||response.status===429||response.status>=500;
   for(const job of jobs)await scheduleRetry(payload.tenantId,payload,job,'Bing SubmitUrlBatch HTTP '+response.status+': '+JSON.stringify(data).slice(0,500),retryable);
   return;
  }
  await tenantTransaction(payload.tenantId,async client=>{
   for(const job of jobs){
    await client.query("UPDATE app.provider_jobs SET status='accepted',response_code=$4,provider_result=$5::jsonb,last_error=NULL,lease_owner=NULL,lease_expires_at=NULL,submitted_at=now(),completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2 AND lease_owner=$3",[payload.tenantId,job.id,workerId,response.status,JSON.stringify({acceptedBy:'bing_webmaster',batchSize:jobs.length,response:data})]);
    await client.query("INSERT INTO app.url_observations(tenant_id,url_id,kind,source,result,confidence) SELECT $1,u.id,'discovery','bing-webmaster-submission',$4::jsonb,'observed' FROM app.urls u WHERE u.tenant_id=$1 AND u.project_id=$2 AND u.normalized_url=$3",[payload.tenantId,payload.projectId,job.url,JSON.stringify({submissionAccepted:true,provider:'bing_webmaster',responseCode:response.status})]);
   }
  });
 }catch(error){for(const job of jobs)await scheduleRetry(payload.tenantId,payload,job,error,true);}
}

async function scheduleNextBatch(payload){
 await tenantTransaction(payload.tenantId,async client=>{
  const pending=await client.query("SELECT 1 FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND provider=$4 AND action=CASE WHEN $4='google_search_console' THEN 'inspect' ELSE 'submit_url' END AND status IN ('queued','retrying') AND scheduled_at<=now() LIMIT 1",[payload.tenantId,payload.projectId,payload.connectionId,payload.provider]);
  if(pending.rowCount){
   const key='provider-next-batch:'+randomUUID();
   await client.query("INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key) VALUES($1,'provider_batch',$2,'provider.jobs.queued','provider.jobs',$3,$4::jsonb,$5) ON CONFLICT(idempotency_key) DO NOTHING",[payload.tenantId,payload.projectId,payload.tenantId+':'+payload.projectId+':'+payload.connectionId,JSON.stringify(payload),key]);
  }
 });
}
async function processEvent(event){
 const payload=event?.payload;
 if(!payload?.tenantId||!payload?.projectId||!payload?.connectionId||!['google_search_console','bing_webmaster'].includes(payload.provider))return;
 const jobs=await claimBatch(payload);if(!jobs.length)return;
 let credential;
 try{credential=await getCredential(payload.tenantId,payload.connectionId,payload.provider);credential=await refreshAccessToken(payload.tenantId,payload.connectionId,payload.provider,credential);}
 catch(error){for(const job of jobs)await scheduleRetry(payload.tenantId,payload,job,error,false);await markConnectionError(payload.tenantId,payload.connectionId,String(error));return;}
 if(payload.provider==='google_search_console')await processGoogle(payload,jobs,credential);
 else await processBing(payload,jobs,credential);
 await scheduleNextBatch(payload);
}
async function shutdown(){stopping=true;try{await consumer.disconnect();}finally{await pool.end();}}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
await consumer.connect();
await consumer.subscribe({topic,fromBeginning:false});
console.log('Index Assist provider worker started');
await consumer.run({autoCommit:false,eachMessage:async({topic,partition,message})=>{
 let event;try{event=JSON.parse(message.value.toString('utf8'));}catch(error){console.error('Invalid provider event',String(error));await consumer.commitOffsets([{topic,partition,offset:(BigInt(message.offset)+1n).toString()}]);return;}
 await processEvent(event);
 await consumer.commitOffsets([{topic,partition,offset:(BigInt(message.offset)+1n).toString()}]);
}});
while(!stopping)await delay(1000);
