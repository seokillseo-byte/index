import {ForbiddenException,Injectable} from '@nestjs/common';
import {DatabaseService} from '../database/database.module';
type Principal={userId:string;tenantId:string};
@Injectable()
export class BillingService{
 constructor(private readonly db:DatabaseService){}
 private async assertRead(client:any,p:Principal){
  const r=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='billing.manage'",[p.tenantId,p.userId]);
  if(!r.rowCount)throw new ForbiddenException('Billing read permission required');
 }
 async summary(p:Principal){
  return this.db.withTransaction(async client=>{
   await this.assertRead(client,p);
   const subscription=await client.query("SELECT s.id,s.status,s.billing_interval,s.current_period_start,s.current_period_end,p.code plan_code,p.name plan_name,p.monthly_price_minor,p.currency,p.daily_url_quota,p.max_projects,p.features FROM app.subscriptions s JOIN app.plans p ON p.id=s.plan_id WHERE s.tenant_id=$1 ORDER BY s.created_at DESC LIMIT 1",[p.tenantId]);
   const usage=await client.query("SELECT (SELECT count(*) FROM app.urls WHERE tenant_id=$1 AND created_at>=date_trunc('day',now()))::bigint urls_today,(SELECT count(*) FROM app.projects WHERE tenant_id=$1)::int projects,(SELECT count(*) FROM app.url_processing_tasks WHERE tenant_id=$1 AND status IN ('pending','leased','retrying'))::bigint active_url_tasks,(SELECT count(*) FROM app.provider_jobs WHERE tenant_id=$1 AND status IN ('queued','leased','retrying'))::bigint active_provider_jobs",[p.tenantId]);
   const sub=subscription.rows[0]||null,used=Number(usage.rows[0].urls_today),quota=Number(sub?.daily_url_quota??0);
   return {subscription:sub,usage:{...usage.rows[0],urls_today:used,daily_url_quota:quota,daily_remaining:Math.max(0,quota-used)}};
  },p.tenantId);
 }
 async plans(p:Principal){
  return this.db.withTransaction(async client=>{
   await this.assertRead(client,p);
   return (await client.query("SELECT id,code,name,monthly_price_minor,currency,daily_url_quota,max_projects,features FROM app.plans WHERE is_active=true ORDER BY monthly_price_minor ASC")).rows;
  },p.tenantId);
 }
 async orders(p:Principal,page=1,limit=50){
  return this.db.withTransaction(async client=>{
   await this.assertRead(client,p);
   const offset=(page-1)*limit;
   const rows=await client.query("SELECT o.id,o.order_number,o.status,o.subtotal_minor,o.tax_minor,o.total_minor,o.currency,o.created_at,o.updated_at,COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',pm.provider,'status',pm.status,'amountMinor',pm.amount_minor,'createdAt',pm.created_at) ORDER BY pm.created_at DESC) FROM app.payments pm WHERE pm.tenant_id=o.tenant_id AND pm.order_id=o.id),'[]'::jsonb) payments FROM app.orders o WHERE o.tenant_id=$1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3",[p.tenantId,limit,offset]);
   const total=await client.query("SELECT count(*)::bigint total FROM app.orders WHERE tenant_id=$1",[p.tenantId]);
   return {page,limit,total:Number(total.rows[0].total),items:rows.rows};
  },p.tenantId);
 }
}
