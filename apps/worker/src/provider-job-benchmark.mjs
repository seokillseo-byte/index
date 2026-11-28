import pg from 'pg';
import {randomUUID} from 'node:crypto';

const {Pool}=pg;

const required=['BENCHMARK_DATABASE_URL','BENCHMARK_TENANT_ID','BENCHMARK_PROJECT_ID','BENCHMARK_CONNECTION_ID','BENCHMARK_SITE_URL'];
for(const key of required)if(!process.env[key])throw new Error(key+' is required');
if(process.env.BENCHMARK_CONFIRM_NONPROD!=='YES')throw new Error('Set BENCHMARK_CONFIRM_NONPROD=YES for a dedicated non-production database');

function positiveInteger(name,value,fallback,max=Number.MAX_SAFE_INTEGER){
 const parsed=Number(value??fallback);
 if(!Number.isSafeInteger(parsed)||parsed<1||parsed>max)throw new Error(name+' must be an integer between 1 and '+max);
 return parsed;
}
const total=positiveInteger('BENCHMARK_JOBS',process.env.BENCHMARK_JOBS,10000);
const concurrency=positiveInteger('BENCHMARK_CONCURRENCY',process.env.BENCHMARK_CONCURRENCY,8,64);
const batchSize=positiveInteger('BENCHMARK_BATCH_SIZE',process.env.BENCHMARK_BATCH_SIZE,100,500);
const pool=new Pool({connectionString:process.env.BENCHMARK_DATABASE_URL,max:concurrency+2,application_name:'index-assist-provider-benchmark'});

const tenantId=process.env.BENCHMARK_TENANT_ID;
const projectId=process.env.BENCHMARK_PROJECT_ID;
const connectionId=process.env.BENCHMARK_CONNECTION_ID;
const siteUrl=process.env.BENCHMARK_SITE_URL;
const provider=process.env.BENCHMARK_PROVIDER||'bing_webmaster';
if(!['bing_webmaster','google_search_console'].includes(provider))throw new Error('BENCHMARK_PROVIDER must be bing_webmaster or google_search_console');
const action=provider==='google_search_console'?'inspect':'submit_url';
const runId=randomUUID();
const idempotencyPrefix='benchmark:'+runId+':';

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
    const baseUrl=siteUrl.endsWith('/')?siteUrl.slice(0,-1):siteUrl; const url=baseUrl+'/__benchmark__/'+runId+'/'+randomUUID();
    await client.query(
      "INSERT INTO app.provider_jobs(tenant_id,project_id,connection_id,provider,action,url,site_url,idempotency_key,status,scheduled_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',now())",
      [tenantId,projectId,connectionId,provider,action,url,siteUrl,idempotencyPrefix+randomUUID()]
    );
   }
  });
  inserted+=count;
 }
 return inserted;
}

async function worker(){
 const workerId='benchmark-'+randomUUID();
 let processed=0;
 const latenciesMs=[];
 while(true){
  const rows=await tx(async client=>{
   const result=await client.query(
    "WITH due AS (SELECT id FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND provider=$4 AND site_url=$5 AND action=$6 AND status='queued' AND idempotency_key LIKE $8 ORDER BY created_at LIMIT $7 FOR UPDATE SKIP LOCKED) UPDATE app.provider_jobs j SET status='leased',lease_owner=$9,lease_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1,updated_at=now() FROM due WHERE j.tenant_id=$1 AND j.id=due.id RETURNING j.id,j.created_at",
    [tenantId,projectId,connectionId,provider,siteUrl,action,batchSize,idempotencyPrefix+'%',workerId]
   );
   if(!result.rowCount)return [];
   await client.query("UPDATE app.provider_jobs SET status='completed',lease_owner=NULL,lease_expires_at=NULL,completed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND lease_owner=$3",[tenantId,result.rows.map(x=>x.id),workerId]);
   return result.rows;
  });
  if(!rows.length)return {processed,latenciesMs};
  const claimedAt=Date.now();
  for(const row of rows)latenciesMs.push(Math.max(0,claimedAt-new Date(row.created_at).getTime()));
  processed+=rows.length;
 }
}

function percentile(values,percent){
 if(!values.length)return 0;
 const sorted=[...values].sort((a,b)=>a-b);
 return sorted[Math.min(sorted.length-1,Math.ceil((percent/100)*sorted.length)-1)];
}

async function databaseSnapshot(){
 const [stats,connections]=await Promise.all([
  pool.query("SELECT xact_commit,blks_read,blks_hit,tup_inserted,tup_updated,tup_deleted,deadlocks,temp_bytes FROM pg_stat_database WHERE datname=current_database()"),
  pool.query("SELECT count(*)::int AS visible_connections,count(*) FILTER (WHERE application_name='index-assist-provider-benchmark')::int AS benchmark_connections FROM pg_stat_activity WHERE datname=current_database()")
 ]);
 return {stats:stats.rows[0]||{},connections:connections.rows[0]||{}};
}

function counterDelta(before,after){
 const keys=['xact_commit','blks_read','blks_hit','tup_inserted','tup_updated','tup_deleted','deadlocks','temp_bytes'];
 return Object.fromEntries(keys.map(key=>[key,Number(after[key]||0)-Number(before[key]||0)]));
}

try{
 const seedStarted=process.hrtime.bigint();
 const inserted=await seed();
 const seedSeconds=Number(process.hrtime.bigint()-seedStarted)/1e9;
 const beforeDrain=await databaseSnapshot();
 const drainStarted=process.hrtime.bigint();
 const workerResults=await Promise.all(Array.from({length:concurrency},()=>worker()));
 const drainSeconds=Number(process.hrtime.bigint()-drainStarted)/1e9;
 const afterDrain=await databaseSnapshot();
 const processed=workerResults.reduce((sum,result)=>sum+result.processed,0);
 const latenciesMs=workerResults.flatMap(result=>result.latenciesMs);
 const rate=drainSeconds>0?processed/drainSeconds:0;
 if(processed!==inserted)throw new Error('Benchmark drained '+processed+' of '+inserted+' seeded jobs');
 console.log(JSON.stringify({
  runId,provider,action,inserted,processed,concurrency,batchSize,
  seedDurationSeconds:Number(seedSeconds.toFixed(3)),
  queueDrainDurationSeconds:Number(drainSeconds.toFixed(3)),
  jobsPerSecond:Number(rate.toFixed(2)),
  estimatedJobsPerDay:Number((rate*86400).toFixed(0)),
  queueLatencyMs:{p50:Number(percentile(latenciesMs,50).toFixed(2)),p95:Number(percentile(latenciesMs,95).toFixed(2)),p99:Number(percentile(latenciesMs,99).toFixed(2)),samples:latenciesMs.length},
  databaseCountersDuringDrain:counterDelta(beforeDrain.stats,afterDrain.stats),
  visibleConnections:{before:beforeDrain.connections.visible_connections,after:afterDrain.connections.visible_connections,benchmarkBefore:beforeDrain.connections.benchmark_connections,benchmarkAfter:afterDrain.connections.benchmark_connections},
  poolMaxConnections:pool.totalCount
 },null,2));
}finally{
 try{
  await tx(async client=>{
   await client.query("DELETE FROM app.provider_jobs WHERE tenant_id=$1 AND project_id=$2 AND connection_id=$3 AND site_url=$4 AND idempotency_key LIKE $5",[tenantId,projectId,connectionId,siteUrl,idempotencyPrefix+'%']);
  });
 }finally{
  await pool.end();
 }
}
