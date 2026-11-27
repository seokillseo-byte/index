import {ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.module';
type Principal={userId:string;tenantId:string};
@Injectable()
export class BacklinksService{
 constructor(private readonly db:DatabaseService){}
 async list(principal:Principal,projectId:string,page=1,limit=50){
  return this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='url.read'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Insufficient workspace permission');
   const project=await client.query("SELECT id,target_url FROM app.projects WHERE tenant_id=$1 AND id=$2",[principal.tenantId,projectId]);
   if(!project.rowCount)throw new NotFoundException('Project not found');
   const offset=(page-1)*limit;
   const rows=await client.query("SELECT b.id,b.source_url_id,u.normalized_url AS source_url,b.target_url,b.anchor_text,b.rel_attributes,b.link_type,b.discovered_at,b.last_seen_at,b.occurrence_count FROM app.backlink_discoveries b JOIN app.urls u ON u.tenant_id=b.tenant_id AND u.id=b.source_url_id WHERE b.tenant_id=$1 AND b.project_id=$2 ORDER BY b.last_seen_at DESC LIMIT $3 OFFSET $4",[principal.tenantId,projectId,limit,offset]);
   const count=await client.query("SELECT count(*)::bigint total FROM app.backlink_discoveries WHERE tenant_id=$1 AND project_id=$2",[principal.tenantId,projectId]);
   const summary=await client.query("SELECT count(*)::bigint total,count(*) FILTER(WHERE link_type='follow')::bigint follow,count(*) FILTER(WHERE link_type<>'follow')::bigint qualified,count(DISTINCT source_url_id)::bigint referring_pages FROM app.backlink_discoveries WHERE tenant_id=$1 AND project_id=$2",[principal.tenantId,projectId]);
   return {projectId,targetUrl:project.rows[0].target_url,page,limit,total:Number(count.rows[0].total),summary:summary.rows[0],items:rows.rows};
  },principal.tenantId);
 }
}
