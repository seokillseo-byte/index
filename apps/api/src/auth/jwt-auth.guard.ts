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
   const s=await this.db.query('SELECT 1 FROM app.user_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()',[p.sid,p.sub]);
   if(!s.rowCount)throw new Error('Revoked session');
   req.principal={userId:p.sub,sessionId:p.sid,tenantId:p.tid,role:p.role};return true;
  }catch{throw new UnauthorizedException('Invalid, expired or revoked access token');}
 }
}
