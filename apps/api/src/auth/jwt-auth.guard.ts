import { CanActivate,ExecutionContext,Injectable,UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DatabaseService } from '../database/database.module';
import { IS_PUBLIC_KEY } from './auth.constants';
export type AuthPrincipal={userId:string;sessionId:string;tenantId:string;role:string};
declare module 'express-serve-static-core'{interface Request{principal?:AuthPrincipal}}
@Injectable()
export class JwtAuthGuard implements CanActivate{
 constructor(private readonly jwt:JwtService,private readonly reflector:Reflector,private readonly db:DatabaseService){}
 async canActivate(context:ExecutionContext):Promise<boolean>{
  if(this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY,[context.getHandler(),context.getClass()]))return true;
  const req=context.switchToHttp().getRequest<Request>(),header=req.headers.authorization;
  if(!header?.startsWith('Bearer '))throw new UnauthorizedException('Bearer access token required');
  try{
   const p=await this.jwt.verifyAsync<{sub:string;sid:string;tid:string;role:string}>(header.slice(7));
   if(!p.sub||!p.sid||!p.tid)throw new Error('Missing claims');
   const s=await this.db.query('SELECT 1 FROM app.user_sessions WHERE id=$1 AND user_id=$2 AND tenant_id=$3 AND revoked_at IS NULL AND expires_at>now()',[p.sid,p.sub,p.tid]);
   if(!s.rowCount)throw new Error('Revoked session');
   const membership=await this.db.withTransaction(async client=>{
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[p.tid]);
    return client.query<{role_code:string}>("SELECT r.code role_code FROM app.tenant_members tm JOIN app.roles r ON r.id=tm.role_id JOIN app.tenants t ON t.id=tm.tenant_id JOIN app.users u ON u.id=tm.user_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND t.status='active' AND u.status='active'",[p.tid,p.sub]);
   });
   if(!membership.rowCount)throw new Error('Tenant membership revoked or user disabled');
   req.principal={userId:p.sub,sessionId:p.sid,tenantId:p.tid,role:membership.rows[0].role_code};return true;
  }catch{throw new UnauthorizedException('Invalid, expired or revoked access token');}
 }
}
