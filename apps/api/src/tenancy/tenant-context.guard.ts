import {CanActivate,ExecutionContext,ForbiddenException,Injectable} from '@nestjs/common';
import {Request} from 'express';
import {DatabaseService} from '../database/database.module';
@Injectable()
export class TenantContextGuard implements CanActivate{
 constructor(private readonly db:DatabaseService){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const req=context.switchToHttp().getRequest<Request>(),principal=req.principal;
  if(!principal)return true;
  const requested=req.headers['x-tenant-id'];
  if(requested&&requested!==principal.tenantId){
   const membership=await this.db.query("SELECT 1 FROM app.tenant_members WHERE tenant_id=$1 AND user_id=$2 AND status='active'",[requested,principal.userId]);
   if(!membership.rowCount)throw new ForbiddenException('Tenant membership required');
   throw new ForbiddenException('Workspace switching requires a newly issued tenant-scoped token');
  }
  return true;
 }
}
