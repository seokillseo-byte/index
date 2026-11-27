import {BadRequestException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.module';
type Principal={userId:string;tenantId:string};
@Injectable()
export class ProjectsService{
 constructor(private readonly db:DatabaseService){}
 private async assertPermission(client:PoolClient,principal:Principal,permission:string){
  const r=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code=$3",[principal.tenantId,principal.userId,permission]);
  if(!r.rowCount)throw new ForbiddenException('Insufficient workspace permission');
 }
 async list(principal:Principal){
  return this.db.withTransaction(async client=>{
   await this.assertPermission(client,principal,'project.read');
   const r=await client.query("SELECT p.id,p.name,p.slug,p.target_url,p.status,p.created_at,p.updated_at,(SELECT count(*) FROM app.urls u WHERE u.tenant_id=p.tenant_id AND u.project_id=p.id) url_count,(SELECT count(*) FROM app.backlink_discoveries b WHERE b.tenant_id=p.tenant_id AND b.project_id=p.id) backlink_count FROM app.projects p WHERE p.tenant_id=$1 ORDER BY p.created_at DESC",[principal.tenantId]);
   return r.rows;
  },principal.tenantId);
 }
 async create(principal:Principal,input:{name:string;targetUrl?:string}){
  const name=input.name.trim();if(!name)throw new BadRequestException('Project name is required');
  const slugBase=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'project';
  return this.db.withTransaction(async client=>{
   await this.assertPermission(client,principal,'project.manage');
   const plan=await client.query("SELECT p.max_projects FROM app.subscriptions s JOIN app.plans p ON p.id=s.plan_id WHERE s.tenant_id=$1 AND s.status IN ('active','trialing') AND s.current_period_end>now() ORDER BY s.created_at DESC LIMIT 1",[principal.tenantId]);
   if(!plan.rowCount)throw new ForbiddenException('No active subscription');
   const count=await client.query("SELECT count(*)::int count FROM app.projects WHERE tenant_id=$1",[principal.tenantId]);
   if(count.rows[0].count>=plan.rows[0].max_projects)throw new ForbiddenException('Project limit reached for current plan');
   const id=randomUUID();let slug=slugBase;
   const exists=await client.query("SELECT 1 FROM app.projects WHERE tenant_id=$1 AND slug=$2",[principal.tenantId,slug]);
   if(exists.rowCount)slug=slugBase+'-'+id.slice(0,8);
   const r=await client.query("INSERT INTO app.projects(id,tenant_id,name,slug,target_url) VALUES($1,$2,$3,$4,$5) RETURNING id,name,slug,target_url,status,created_at,updated_at",[id,principal.tenantId,name,slug,input.targetUrl??null]);
   return r.rows[0];
  },principal.tenantId);
 }
 async update(principal:Principal,id:string,input:{name?:string;targetUrl?:string|null}){
  return this.db.withTransaction(async client=>{
   await this.assertPermission(client,principal,'project.manage');
   const r=await client.query("UPDATE app.projects SET name=COALESCE($3,name),target_url=CASE WHEN $4::boolean THEN $5 ELSE target_url END,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,slug,target_url,status,created_at,updated_at",[principal.tenantId,id,input.name?.trim()??null,input.targetUrl!==undefined,input.targetUrl??null]);
   if(!r.rowCount)throw new NotFoundException('Project not found');
   return r.rows[0];
  },principal.tenantId);
 }
}
