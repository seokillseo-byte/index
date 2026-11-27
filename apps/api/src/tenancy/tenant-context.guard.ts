import {CanActivate,ExecutionContext,ForbiddenException,Injectable} from '@nestjs/common';
import {Request} from 'express';
@Injectable()
export class TenantContextGuard implements CanActivate{
 canActivate(context:ExecutionContext):boolean{
  const req=context.switchToHttp().getRequest<Request>(),principal=req.principal;
  if(!principal)return true;
  const requested=req.headers['x-tenant-id'];
  if(requested&&requested!==principal.tenantId)throw new ForbiddenException('Workspace switching requires a newly issued tenant-scoped token');
  return true;
 }
}
