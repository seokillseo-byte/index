import {CanActivate,ExecutionContext,ForbiddenException,Injectable,SetMetadata,UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {Request} from 'express';
import {DatabaseService} from '../database/database.module';
import {AuthPrincipal} from '../auth/jwt-auth.guard';

export const PLATFORM_ROLES_KEY='platformAdminRoles';
export const PlatformRoles=(...roles:string[])=>SetMetadata(PLATFORM_ROLES_KEY,roles);
declare module 'express'{interface Request{platformAdminRole?:string}}

@Injectable()
export class PlatformAdminGuard implements CanActivate{
 constructor(private readonly db:DatabaseService,private readonly reflector:Reflector){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  const req=context.switchToHttp().getRequest<Request>(),principal=req.principal as AuthPrincipal|undefined;
  if(!principal)throw new UnauthorizedException('Authenticated account required');
  let role:string|undefined;
  try{
   const result=await this.db.withAdminTransaction(principal.userId,client=>client.query<{role:string}>(
    "SELECT role FROM app.platform_admins WHERE user_id=$1 AND status='active'",[principal.userId]));
   role=result.rows[0]?.role;
  }catch{throw new ForbiddenException('Platform administrator access required');}
  if(!role)throw new ForbiddenException('Platform administrator access required');
  const allowed=this.reflector.getAllAndOverride<string[]>(PLATFORM_ROLES_KEY,[context.getHandler(),context.getClass()]);
  if(allowed?.length&&role!=='super_admin'&&role!=='admin'&&!allowed.includes(role))throw new ForbiddenException('Insufficient platform administrator role');
  req.platformAdminRole=role;
  return true;
 }
}
