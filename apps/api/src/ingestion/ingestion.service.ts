import {BadRequestException,ForbiddenException,Injectable,TooManyRequestsException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.module';
type Principal={userId:string;tenantId:string};
function normalizeUrl(raw:string):{url:string;hostname:string;hash:Buffer}{
 let parsed:URL;try{parsed=new URL(raw.trim());}catch{throw new BadRequestException('One or more URLs are invalid');}
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||!parsed.hostname)throw new BadRequestException('Only HTTP(S) URLs without embedded credentials are accepted');
 parsed.hash='';parsed.hostname=parsed.hostname.toLowerCase();
 if((parsed.protocol==='https:'&&parsed.port==='443')||(parsed.protocol==='http:'&&parsed.port==='80'))parsed.port='';
 const url=parsed.toString();return {url,hostname:parsed.hostname,hash:createHash('sha256').update(url).digest()};
}
@Injectable()
export class IngestionService{
 constructor(private readonly db:DatabaseService){}
 async ingest(principal:Principal,input:{projectId:string;tier:number;urls:string[]},idempotencyKey:string){
  if(!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))throw new BadRequestException('A valid Idempotency-Key header is required');
  const normalized=new Map<string,{url:string;hostname:string;hash:Buffer}>();let rejected=0,valid=0;
  for(const raw of input.urls){try{const item=normalizeUrl(raw);valid++;normalized.set(item.url,item);}catch{rejected++;}}
  const items=[...normalized.values()],batchId=randomUUID();
  return this.db.withTransaction(async client=>{
   const project=await client.query("SELECT id FROM app.projects WHERE tenant_id=$1 AND id=$2 AND status='active'",[principal.tenantId,input.projectId]);
   if(!project.rowCount)throw new ForbiddenException('Project not found or unavailable in this workspace');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[principal.tenantId+':'+idempotencyKey]);
   const previous=await client.query("SELECT id,total_submitted,accepted_count,duplicate_count,rejected_count,status FROM app.ingestion_batches WHERE tenant_id=$1 AND idempotency_key=$2",[principal.tenantId,idempotencyKey]);
   if(previous.rows[0])return {...previous.rows[0],replayed:true};
   await client.query("INSERT INTO app.ingestion_batches(id,tenant_id,project_id,source,idempotency_key,total_submitted,created_by) VALUES($1,$2,$3,'api',$4,$5,$6)",[batchId,principal.tenantId,input.projectId,idempotencyKey,input.urls.length,principal.userId]);
   const sql=[
    "WITH incoming AS (SELECT unnest($3::text[]) normalized_url,unnest($4::bytea[]) url_hash,unnest($5::text[]) hostname),",
    "added AS (INSERT INTO app.urls(tenant_id,project_id,normalized_url,url_hash,hostname,tier,status,next_check_at)",
    "SELECT $1,$2,normalized_url,url_hash,hostname,$6,'queued',now() FROM incoming",
    "ON CONFLICT(tenant_id,project_id,url_hash) DO NOTHING RETURNING id),",
    "tasks AS (INSERT INTO app.url_processing_tasks(tenant_id,url_id,task_type,status,priority,idempotency_key)",
    "SELECT $1,id,'http_check','pending',5,'http-check:'||id::text FROM added",
    "ON CONFLICT(idempotency_key) DO NOTHING RETURNING id) SELECT id FROM added"
   ].join(' ');
   const inserted=await client.query<{id:string}>(sql,[principal.tenantId,input.projectId,items.map(x=>x.url),items.map(x=>x.hash),items.map(x=>x.hostname),input.tier]);
   const accepted=inserted.rowCount??0,duplicates=valid-accepted;
   const quota=await client.query<{daily_url_quota:string}>("SELECT p.daily_url_quota::text FROM app.subscriptions s JOIN app.plans p ON p.id=s.plan_id WHERE s.tenant_id=$1 AND s.status IN ('active','trialing') AND s.current_period_end>now() ORDER BY s.created_at DESC LIMIT 1",[principal.tenantId]);
   if(!quota.rows[0])throw new ForbiddenException('No active subscription for this workspace');
   const dailyLimit=Number(quota.rows[0].daily_url_quota);
   const usage=await client.query("INSERT INTO app.tenant_usage_daily(tenant_id,usage_date,accepted_urls) SELECT $1,current_date,$2 WHERE $2 <= $3 ON CONFLICT(tenant_id,usage_date) DO UPDATE SET accepted_urls=app.tenant_usage_daily.accepted_urls+EXCLUDED.accepted_urls,updated_at=now() WHERE app.tenant_usage_daily.accepted_urls+EXCLUDED.accepted_urls <= $3 RETURNING accepted_urls",[principal.tenantId,accepted,dailyLimit]);
   if(!usage.rowCount)throw new TooManyRequestsException({message:'Daily URL quota exceeded',dailyLimit});
   await client.query("UPDATE app.ingestion_batches SET accepted_count=$2,duplicate_count=$3,rejected_count=$4,status=CASE WHEN $4>0 THEN 'partial' ELSE 'accepted' END WHERE id=$1",[batchId,accepted,duplicates,rejected]);
   await client.query("INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key) VALUES($1,'ingestion_batch',$2,'url.batch.accepted','url.ingestion',$1::text,$3::jsonb,$4) ON CONFLICT(idempotency_key) DO NOTHING",[principal.tenantId,batchId,JSON.stringify({batchId,projectId:input.projectId,tier:input.tier,acceptedCount:accepted}),"url-batch:"+batchId]);
   return {batchId,totalSubmitted:input.urls.length,accepted,duplicates,rejected,status:rejected?'partial':'accepted',replayed:false};
  },principal.tenantId);
 }
}
