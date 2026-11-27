import pg from 'pg';
import {randomUUID} from 'node:crypto';

const {Pool}=pg;

const required=['BENCHMARK_DATABASE_URL','BENCHMARK_TENANT_ID','BENCHMARK_PROJECT_ID','BENCHMARK_CONNECTION_ID','BENCHMARK_SITE_URL'];
for(const key of required)if(!process.env[key])throw new Error(key+' is required');
if(process.env.BENCHMARK_CONFIRM_NONPROD!=='YES')throw new Error('Set BENCHMARK_CONFIRM_NONPROD=YES for a dedicated non-production database');

const total=Math.max(1,Number(process.env.BENCHMARK_JOBS||10000));
const concurrency=Math.max(1,Math.min(64,Number(process.env.BENCHMARK_CONCURRENCY||8)));
const batchSize=Math.max(1,Math.min(500,Number(process.env.BENCHMARK_BATCH_SIZE||100)));
const pool=new Pool({connectionString:process.env.BENCHMARK_DATABASE_URL,max:concurrency+2,application_name:'index-assist-provider-benchmark'});

const tenantId=process.env.BENCHMARK_TENANT_ID;
const projectId=process.env.BENCHMARK_PROJECT_ID;
const connectionId=process.env.BENCHMARK_CONNECTION_ID;
const siteUrl=process.env.BENCHMARK_SITE_URL;
const provider=process.env.BENCHMARK_PROVIDER||'bing_webmaster';
const action=provider==='google_search_console'?'inspect':'submit_url';

async function tx(fn){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
  const value=await fn(client);
  await client.query('COMMIT');
  return value;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

async function seed(){
 let inserted=0;
 while(inserted<total){
  const count=Math.min(batchSize,total-inserted);
  await tx(async client=>{
   for(let i=0;i<count;i++){
    const url=siteUrl.replace(/\/$/,'')+'/__benchmark__/'+randomUUID();
    await client.query(
      "INSERT INTO app.provider_jobs(tenant_id,project_id,connection_id,provider,action,url,site_url,idempotency_key,status,scheduled_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',now())",
      [tenantId,projectId,connectionId,provider,action,url,siteUrl,'benchmark:'+randomUUID()]
    );
   }
  });
  inserted+=count;
 }
 return inserted;
}

async function worker(){
 let processed=0;
 while(true){
  const rows=await tx(async client=>{
   const result=await client.query(
    "WITH due AS (SELECT id FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND provider=$4 AND site_url=$5 AND action=$6 AND status='queued' ORDER BY created_at LIMIT $7 FOR UPDATE SKIP LOCKED) UPDATE app.provider_jobs j SET status='leased',lease_owner=$8,lease_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1,updated_at=now() FROM due WHERE j.tenant_id=$1 AND j.id=due.id RETURNING j.id",
    [tenantId,projectId,connectionId,provider,siteUrl,action,batchSize,workerId]
   );
   if(!result.rowCount)return [];
   await client.query("UPDATE app.provider_jobs SET status='completed',lease_owner=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND lease_owner=$3",[tenantId,result.rows.map(x=>x.id),workerId]);
   return result.rows;
  });
  if(!rows.length)return processed;
  processed+=rows.length;
 }
}

const started=process.hrtime.bigint();
const inserted=await seed();
const workers=Array.from({length:concurrency},()=>worker());
const counts=await Promise.all(workers);
const seconds=Number(process.hrtime.bigint()-started)/1e9;
const processed=counts.reduce((a,b)=>a+b,0);
const rate=processed/seconds;
console.log(JSON.stringify({provider,action,inserted,processed,concurrency,batchSize,durationSeconds:Number(seconds.toFixed(3)),jobsPerSecond:Number(rate.toFixed(2)),jobsPerDay:Number((rate*86400).toFixed(0))},null,2));
await tx(async client=>{
 await client.query("DELETE FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND site_url=$4 AND idempotency_key LIKE 'benchmark:%'",[tenantId,projectId,connectionId,siteUrl]);
});
await pool.end();
