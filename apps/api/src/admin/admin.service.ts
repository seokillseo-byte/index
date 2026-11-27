import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {DatabaseService} from '../database/database.module';
import {SaveCmsDto} from './admin.dto';

@Injectable()
export class AdminService{
 constructor(private readonly db:DatabaseService){}
 private audit(client:any,actorId:string,action:string,resourceType:string,resourceId:string|null,metadata:Record<string,unknown>={},ip?:string){
  return client.query("INSERT INTO app.platform_admin_audit_logs(actor_user_id,action,resource_type,resource_id,ip_address,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[actorId,action,resourceType,resourceId,ip||null,JSON.stringify(metadata)]);
 }
 async overview(actorId:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const r=await client.query("SELECT (SELECT count(*) FROM app.tenants WHERE status='active')::bigint active_tenants,(SELECT count(*) FROM app.users WHERE status='active')::bigint active_users,(SELECT count(*) FROM app.projects)::bigint projects,(SELECT count(*) FROM app.urls)::bigint urls_total,(SELECT count(*) FROM app.url_processing_tasks WHERE status IN ('pending','leased','retrying'))::bigint url_tasks_active,(SELECT count(*) FROM app.provider_jobs WHERE status IN ('queued','leased','retrying'))::bigint provider_jobs_active,(SELECT count(*) FROM app.orders WHERE status IN ('pending','awaiting_payment'))::bigint pending_orders,(SELECT count(*) FROM app.advertiser_inquiries WHERE status='new')::bigint new_ad_inquiries,(SELECT count(*) FROM app.ad_campaigns WHERE status IN ('pending_review','approved','scheduled','active'))::bigint active_ad_campaigns,(SELECT count(*) FROM app.cms_posts WHERE status='published')::bigint published_posts");
   return Object.fromEntries(Object.entries(r.rows[0]).map(([k,v])=>[k,typeof v==='string'&&/^\d+$/.test(v)?Number(v):v]));
  });
 }
 async customers(actorId:string,page=1,limit=50,search?:string,status?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const offset=(page-1)*limit;
   const rows=await client.query("SELECT t.id,t.name,t.slug,t.status,t.created_at,s.status subscription_status,p.code plan_code,p.name plan_name,count(DISTINCT tm.user_id)::int member_count,count(DISTINCT pr.id)::int project_count,count(DISTINCT u.id)::bigint url_count FROM app.tenants t LEFT JOIN LATERAL(SELECT * FROM app.subscriptions WHERE tenant_id=t.id AND status IN ('trialing','active','past_due','paused') ORDER BY created_at DESC LIMIT 1)s ON true LEFT JOIN app.plans p ON p.id=s.plan_id LEFT JOIN app.tenant_members tm ON tm.tenant_id=t.id AND tm.status='active' LEFT JOIN app.projects pr ON pr.tenant_id=t.id LEFT JOIN app.urls u ON u.tenant_id=t.id WHERE ($1::text IS NULL OR t.name ILIKE '%'||$1||'%' OR t.slug ILIKE '%'||$1||'%') AND ($2::text IS NULL OR t.status=$2) GROUP BY t.id,s.status,p.code,p.name ORDER BY t.created_at DESC LIMIT $3 OFFSET $4",[search||null,status||null,limit,offset]);
   const total=await client.query("SELECT count(*)::bigint total FROM app.tenants t WHERE ($1::text IS NULL OR t.name ILIKE '%'||$1||'%' OR t.slug ILIKE '%'||$1||'%') AND ($2::text IS NULL OR t.status=$2)",[search||null,status||null]);
   return {page,limit,total:Number(total.rows[0].total),items:rows.rows};
  });
 }
 async customerDetail(actorId:string,tenantId:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const tenant=await client.query("SELECT t.*,s.id subscription_id,s.status subscription_status,s.current_period_start,s.current_period_end,p.code plan_code,p.name plan_name,p.daily_url_quota,p.max_projects FROM app.tenants t LEFT JOIN LATERAL(SELECT * FROM app.subscriptions WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1)s ON true LEFT JOIN app.plans p ON p.id=s.plan_id WHERE t.id=$1",[tenantId]);
   if(!tenant.rowCount)throw new NotFoundException('Customer workspace not found');
   const members=await client.query("SELECT u.id,u.email,u.display_name,u.status user_status,tm.status membership_status,r.code role,tm.joined_at FROM app.tenant_members tm JOIN app.users u ON u.id=tm.user_id JOIN app.roles r ON r.id=tm.role_id WHERE tm.tenant_id=$1 ORDER BY tm.joined_at DESC NULLS LAST",[tenantId]);
   const projects=await client.query("SELECT p.id,p.name,p.slug,p.target_url,p.status,p.created_at,count(u.id)::bigint url_count FROM app.projects p LEFT JOIN app.urls u ON u.tenant_id=p.tenant_id AND u.project_id=p.id WHERE p.tenant_id=$1 GROUP BY p.id ORDER BY p.created_at DESC",[tenantId]);
   const orders=await client.query("SELECT id,order_number,status,total_minor,currency,created_at,updated_at FROM app.orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20",[tenantId]);
   return {tenant:tenant.rows[0],members:members.rows,projects:projects.rows,orders:orders.rows};
  });
 }
 async updateTenantStatus(actorId:string,tenantId:string,status:string,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const r=await client.query("UPDATE app.tenants SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,name,status",[tenantId,status]);
   if(!r.rowCount)throw new NotFoundException('Customer workspace not found');
   await this.audit(client,actorId,'tenant.status.updated','tenant',tenantId,{status},ip);
   return r.rows[0];
  });
 }
 async orders(actorId:string,page=1,limit=50,status?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const offset=(page-1)*limit;
   const rows=await client.query("SELECT o.id,o.order_number,o.tenant_id,t.name tenant_name,o.status,o.subtotal_minor,o.tax_minor,o.total_minor,o.currency,o.created_at,o.updated_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'provider',p.provider,'status',p.status,'amountMinor',p.amount_minor,'currency',p.currency,'createdAt',p.created_at) ORDER BY p.created_at DESC) FROM app.payments p WHERE p.tenant_id=o.tenant_id AND p.order_id=o.id),'[]'::jsonb) payments FROM app.orders o JOIN app.tenants t ON t.id=o.tenant_id WHERE ($1::text IS NULL OR o.status=$1) ORDER BY o.created_at DESC LIMIT $2 OFFSET $3",[status||null,limit,offset]);
   const total=await client.query("SELECT count(*)::bigint total FROM app.orders WHERE ($1::text IS NULL OR status=$1)",[status||null]);
   return {page,limit,total:Number(total.rows[0].total),items:rows.rows};
  });
 }
 async updateOrderStatus(actorId:string,orderId:string,status:string,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const current=await client.query("SELECT id,tenant_id,status FROM app.orders WHERE id=$1 FOR UPDATE",[orderId]);
   if(!current.rowCount)throw new NotFoundException('Order not found');
   if(status==='fulfilled'&&current.rows[0].status!=='paid')throw new BadRequestException('Only paid orders can be fulfilled');
   if(['cancelled','rejected'].includes(status)&&!['pending','awaiting_payment'].includes(current.rows[0].status))throw new BadRequestException('Order cannot transition to the requested status');
   const r=await client.query("UPDATE app.orders SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,order_number,status,total_minor,currency",[orderId,status]);
   await this.audit(client,actorId,'order.status.updated','order',orderId,{from:current.rows[0].status,to:status,tenantId:current.rows[0].tenant_id},ip);
   return r.rows[0];
  });
 }
 async cmsList(actorId:string,type:'page'|'post'){
  return this.db.withAdminTransaction(actorId,async client=>{
   const table=type==='page'?'cms_pages':'cms_posts';
   return (await client.query("SELECT c.*,s.seo_title,s.meta_description,s.canonical_url,s.robots_index,s.robots_follow FROM app."+table+" c LEFT JOIN app.seo_metadata s ON s.entity_type=$1 AND s.entity_id=c.id ORDER BY c.updated_at DESC LIMIT 200",[type])).rows;
  });
 }
 async saveCms(actorId:string,type:'page'|'post',input:SaveCmsDto,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const table=type==='page'?'cms_pages':'cms_posts';
   let r;
   if(input.id){
    r=await client.query("UPDATE app."+table+" SET title=$2,slug=$3,body=$4::jsonb,status=$5,published_at=CASE WHEN $5='published' THEN COALESCE(published_at,now()) ELSE NULL END,updated_at=now(),"+(type==='page'?'updated_by=$6':'author_id=COALESCE(author_id,$6)') WHERE id=$1 RETURNING *",[input.id,input.title,input.slug,JSON.stringify(input.body),input.status||'draft',actorId]);
    if(!r.rowCount)throw new NotFoundException('CMS item not found');
   }else{
    if(type==='page')r=await client.query("INSERT INTO app.cms_pages(title,slug,body,status,published_at,created_by,updated_by) VALUES($1,$2,$3::jsonb,$4,CASE WHEN $4='published' THEN now() ELSE NULL END,$5,$5) RETURNING *",[input.title,input.slug,JSON.stringify(input.body),input.status||'draft',actorId]);
    else r=await client.query("INSERT INTO app.cms_posts(title,slug,excerpt,body,status,published_at,author_id) VALUES($1,$2,$3,$4::jsonb,$5,CASE WHEN $5='published' THEN now() ELSE NULL END,$6) RETURNING *",[input.title,input.slug,input.excerpt||null,JSON.stringify(input.body),input.status||'draft',actorId]);
   }
   const entityId=r.rows[0].id;
   await client.query("INSERT INTO app.seo_metadata(entity_type,entity_id,seo_title,meta_description,canonical_url) VALUES($1,$2,$3,$4,$5) ON CONFLICT(entity_type,entity_id) DO UPDATE SET seo_title=EXCLUDED.seo_title,meta_description=EXCLUDED.meta_description,canonical_url=EXCLUDED.canonical_url,updated_at=now()",[type,entityId,input.seoTitle||null,input.metaDescription||null,input.canonicalUrl||null]);
   await this.audit(client,actorId,type+'.saved',type,entityId,{slug:input.slug,status:input.status||'draft'},ip);
   return r.rows[0];
  });
 }
 async campaigns(actorId:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   return (await client.query("SELECT c.id,c.name,c.status,c.destination_url,c.starts_at,c.ends_at,c.budget_minor,c.currency,c.created_at,a.company_name advertiser_name,(SELECT count(*) FROM app.ad_creatives cr WHERE cr.campaign_id=c.id)::int creative_count,(SELECT count(*) FROM app.ad_events e WHERE e.campaign_id=c.id AND e.event_type='impression')::bigint impressions,(SELECT count(*) FROM app.ad_events e WHERE e.campaign_id=c.id AND e.event_type='click')::bigint clicks FROM app.ad_campaigns c LEFT JOIN app.advertisers a ON a.id=c.advertiser_id ORDER BY c.created_at DESC LIMIT 200")).rows;
  });
 }
 async updateCampaignStatus(actorId:string,campaignId:string,status:string,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const current=await client.query("SELECT id,status FROM app.ad_campaigns WHERE id=$1 FOR UPDATE",[campaignId]);
   if(!current.rowCount)throw new NotFoundException('Campaign not found');
   if(status==='active'&&!['approved','scheduled','paused','active'].includes(current.rows[0].status))throw new BadRequestException('Campaign must be approved before activation');
   const r=await client.query("UPDATE app.ad_campaigns SET status=$2,approved_by=CASE WHEN $2='approved' THEN $3 ELSE approved_by END WHERE id=$1 RETURNING id,name,status",[campaignId,status,actorId]);
   await this.audit(client,actorId,'ad_campaign.status.updated','ad_campaign',campaignId,{from:current.rows[0].status,to:status},ip);
   return r.rows[0];
  });
 }
 async inquiries(actorId:string){
  return this.db.withAdminTransaction(actorId,async client=>(await client.query("SELECT id,company_name,contact_name,email,website_url,requested_budget_minor,message,status,created_at FROM app.advertiser_inquiries ORDER BY created_at DESC LIMIT 300")).rows);
 }
 async updateInquiry(actorId:string,id:string,status:string,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const r=await client.query("UPDATE app.advertiser_inquiries SET status=$2 WHERE id=$1 RETURNING id,company_name,status",[id,status]);
   if(!r.rowCount)throw new NotFoundException('Advertiser inquiry not found');
   await this.audit(client,actorId,'advertiser_inquiry.status.updated','advertiser_inquiry',id,{status},ip);
   return r.rows[0];
  });
 }
 async adSlots(actorId:string){
  return this.db.withAdminTransaction(actorId,async client=>(await client.query("SELECT id,code,name,surface,placement,allowed_formats,enabled,policy_config FROM app.ad_slots ORDER BY surface,placement,code")).rows);
 }
 async updateAdSlot(actorId:string,id:string,input:{enabled?:boolean;name?:string;placement?:string},ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const r=await client.query("UPDATE app.ad_slots SET enabled=COALESCE($2,enabled),name=COALESCE($3,name),placement=COALESCE($4,placement) WHERE id=$1 RETURNING id,code,name,enabled,placement",[id,input.enabled??null,input.name??null,input.placement??null]);
   if(!r.rowCount)throw new NotFoundException('Ad slot not found');
   await this.audit(client,actorId,'ad_slot.updated','ad_slot',id,input,ip);
   return r.rows[0];
  });
 }

 async advertisers(actorId:string){
  return this.db.withAdminTransaction(actorId,async client=>(await client.query("SELECT id,company_name,contact_email,status,created_at FROM app.advertisers ORDER BY created_at DESC LIMIT 300")).rows);
 }
 async createAdvertiser(actorId:string,input:{companyName:string;contactEmail:string},ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const r=await client.query("INSERT INTO app.advertisers(company_name,contact_email,status) VALUES($1,$2,'pending') RETURNING id,company_name,contact_email,status,created_at",[input.companyName,input.contactEmail]);
   await this.audit(client,actorId,'advertiser.created','advertiser',r.rows[0].id,{companyName:input.companyName},ip);return r.rows[0];
  });
 }
 async convertInquiry(actorId:string,id:string,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const inquiry=await client.query("SELECT id,company_name,email,status FROM app.advertiser_inquiries WHERE id=$1 FOR UPDATE",[id]);
   if(!inquiry.rowCount)throw new NotFoundException('Advertiser inquiry not found');
   if(inquiry.rows[0].status==='converted')throw new BadRequestException('Inquiry has already been converted');
   const advertiser=await client.query("INSERT INTO app.advertisers(company_name,contact_email,status) VALUES($1,$2,'pending') RETURNING id,company_name,contact_email,status",[inquiry.rows[0].company_name,inquiry.rows[0].email]);
   await client.query("UPDATE app.advertiser_inquiries SET status='converted' WHERE id=$1",[id]);
   await this.audit(client,actorId,'advertiser_inquiry.converted','advertiser_inquiry',id,{advertiserId:advertiser.rows[0].id},ip);
   return advertiser.rows[0];
  });
 }
 async createCampaign(actorId:string,input:{advertiserId:string;name:string;destinationUrl:string;budgetMinor:number;currency:string;startsAt?:string;endsAt?:string},ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const advertiser=await client.query("SELECT id,status FROM app.advertisers WHERE id=$1",[input.advertiserId]);
   if(!advertiser.rowCount)throw new NotFoundException('Advertiser not found');
   if(advertiser.rows[0].status!=='active')throw new BadRequestException('Advertiser must be active before creating a campaign');
   if(input.startsAt&&input.endsAt&&new Date(input.endsAt)<=new Date(input.startsAt))throw new BadRequestException('Campaign end date must be after start date');
   const r=await client.query("INSERT INTO app.ad_campaigns(advertiser_id,name,destination_url,budget_minor,currency,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING id,name,status,destination_url,budget_minor,currency,starts_at,ends_at",[input.advertiserId,input.name,input.destinationUrl,input.budgetMinor,input.currency.toUpperCase(),input.startsAt||null,input.endsAt||null]);
   await this.audit(client,actorId,'ad_campaign.created','ad_campaign',r.rows[0].id,{advertiserId:input.advertiserId},ip);return r.rows[0];
  });
 }
 async creatives(actorId:string){
  return this.db.withAdminTransaction(actorId,async client=>(await client.query("SELECT cr.id,cr.campaign_id,c.name campaign_name,cr.slot_id,s.code slot_code,cr.headline,cr.asset_key,cr.alt_text,cr.disclosure_label,cr.status,cr.created_at FROM app.ad_creatives cr JOIN app.ad_campaigns c ON c.id=cr.campaign_id JOIN app.ad_slots s ON s.id=cr.slot_id ORDER BY cr.created_at DESC LIMIT 300")).rows);
 }
 async createCreative(actorId:string,input:{campaignId:string;slotId:string;headline:string;assetKey:string;altText?:string;disclosureLabel:string},ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const campaign=await client.query("SELECT id,status FROM app.ad_campaigns WHERE id=$1",[input.campaignId]);
   if(!campaign.rowCount)throw new NotFoundException('Campaign not found');
   if(!['approved','active','scheduled','paused'].includes(campaign.rows[0].status))throw new BadRequestException('Campaign must be approved before attaching a creative');
   const slot=await client.query("SELECT id,enabled FROM app.ad_slots WHERE id=$1",[input.slotId]);
   if(!slot.rowCount)throw new NotFoundException('Ad slot not found');
   const r=await client.query("INSERT INTO app.ad_creatives(campaign_id,slot_id,headline,asset_key,alt_text,disclosure_label,status) VALUES($1,$2,$3,$4,$5,$6,'pending_review') RETURNING id,campaign_id,slot_id,headline,status",[input.campaignId,input.slotId,input.headline,input.assetKey,input.altText||null,input.disclosureLabel]);
   await this.audit(client,actorId,'ad_creative.created','ad_creative',r.rows[0].id,{campaignId:input.campaignId,slotId:input.slotId},ip);return r.rows[0];
  });
 }
 async updateCreativeStatus(actorId:string,id:string,status:string,ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const current=await client.query("SELECT cr.id,cr.status,c.status campaign_status,s.enabled slot_enabled FROM app.ad_creatives cr JOIN app.ad_campaigns c ON c.id=cr.campaign_id JOIN app.ad_slots s ON s.id=cr.slot_id WHERE cr.id=$1 FOR UPDATE OF cr",[id]);
   if(!current.rowCount)throw new NotFoundException('Creative not found');
   if(status==='approved'&&(!['approved','active','scheduled','paused'].includes(current.rows[0].campaign_status)||!current.rows[0].slot_enabled))throw new BadRequestException('Approve the campaign and enable its slot before approving the creative');
   const r=await client.query("UPDATE app.ad_creatives SET status=$2 WHERE id=$1 RETURNING id,status",[id,status]);
   await this.audit(client,actorId,'ad_creative.status.updated','ad_creative',id,{from:current.rows[0].status,to:status},ip);return r.rows[0];
  });
 }
 async createAdSlot(actorId:string,input:{code:string;name:string;surface:string;placement:string;allowedFormats?:string[];enabled?:boolean;policyConfig?:Record<string,unknown>},ip?:string){
  return this.db.withAdminTransaction(actorId,async client=>{
   const r=await client.query("INSERT INTO app.ad_slots(code,name,surface,placement,allowed_formats,enabled,policy_config) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id,code,name,surface,placement,allowed_formats,enabled",[input.code,input.name,input.surface,input.placement,input.allowedFormats||[],input.enabled??false,JSON.stringify(input.policyConfig||{})]);
   await this.audit(client,actorId,'ad_slot.created','ad_slot',r.rows[0].id,{code:input.code},ip);return r.rows[0];
  });
 }
 async auditLogs(actorId:string,page=1,limit=50){
  return this.db.withAdminTransaction(actorId,async client=>{
   const offset=(page-1)*limit;
   const rows=await client.query("SELECT l.id,l.actor_user_id,u.email actor_email,l.action,l.resource_type,l.resource_id,l.ip_address,l.metadata,l.created_at FROM app.platform_admin_audit_logs l JOIN app.users u ON u.id=l.actor_user_id ORDER BY l.created_at DESC LIMIT $1 OFFSET $2",[limit,offset]);
   const count=await client.query("SELECT count(*)::bigint total FROM app.platform_admin_audit_logs");
   return {page,limit,total:Number(count.rows[0].total),items:rows.rows};
  });
 }
}
