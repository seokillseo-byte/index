import { ConflictException, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.module';
import { EmailService } from './email.service';

type Membership={tenant_id:string;tenant_name:string;role_code:string};
type UserRow={id:string;email:string;display_name:string|null;password_hash:string;status:string;email_verified_at:Date|null};

@Injectable()
export class AuthService{
 constructor(private readonly db:DatabaseService,private readonly jwt:JwtService,private readonly config:ConfigService,private readonly email:EmailService){}
 private hashToken(token:string):Buffer{return createHash('sha256').update(token,'utf8').digest();}
 private async createSession(userId:string,tenantId:string,role:string){
  const sessionId=randomUUID(),refreshToken=randomBytes(48).toString('base64url');
  const days=Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS')??30);
  await this.db.query("INSERT INTO app.user_sessions(id,user_id,tenant_id,refresh_token_hash,expires_at) VALUES($1,$2,$3,$4,now()+($5::text || ' days')::interval)",[sessionId,userId,tenantId,this.hashToken(refreshToken),days]);
  const accessToken=await this.jwt.signAsync({sub:userId,sid:sessionId,tid:tenantId,role});
  return {accessToken,refreshToken,tokenType:'Bearer',expiresIn:Number(this.config.get<string>('ACCESS_TOKEN_TTL_SECONDS')??900)};
 }
 private async createVerificationToken(userId:string):Promise<string>{
  const token=randomBytes(32).toString('base64url');
  await this.db.query("DELETE FROM app.email_verification_tokens WHERE user_id=$1 AND used_at IS NULL",[userId]);
  await this.db.query("INSERT INTO app.email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",[userId,this.hashToken(token)]);
  return token;
 }
 private async sendVerificationEmail(userId:string,email:string,displayName:string):Promise<void>{
  const token=await this.createVerificationToken(userId);
  await this.email.sendVerificationEmail(email,displayName,token);
 }
 private async membershipFor(userId:string){
  return this.db.withTransaction(async client=>{
   await client.query("SELECT set_config('app.auth_user_id',$1,true)",[userId]);
   const result=await client.query<Membership>("SELECT tm.tenant_id,t.name tenant_name,r.code role_code FROM app.tenant_members tm JOIN app.tenants t ON t.id=tm.tenant_id JOIN app.roles r ON r.id=tm.role_id WHERE tm.user_id=$1 AND tm.status='active' AND t.status='active' ORDER BY tm.joined_at ASC LIMIT 1",[userId]);
   return result.rows[0];
  });
 }
 async register(input:{email:string;password:string;displayName:string;workspaceName:string}){
  const passwordHash=await argon2.hash(input.password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  const slug=input.workspaceName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)+'-'+randomBytes(3).toString('hex');
  try{
   const created=await this.db.withTransaction(async client=>{
    const user=await client.query<{id:string}>('INSERT INTO app.users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id',[input.email.toLowerCase(),passwordHash,input.displayName]);
    const tenantId=randomUUID();
    await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);
    const tenant=await client.query<{id:string;name:string}>('INSERT INTO app.tenants(id,name,slug) VALUES($1,$2,$3) RETURNING id,name',[tenantId,input.workspaceName,slug]);
    const owner=await client.query<{id:string}>("SELECT id FROM app.roles WHERE code='owner'");
    if(!owner.rowCount)throw new Error('Database role seed missing: owner');
    await client.query("INSERT INTO app.tenant_members(tenant_id,user_id,role_id,status,joined_at) VALUES($1,$2,$3,'active',now())",[tenant.rows[0].id,user.rows[0].id,owner.rows[0].id]);
    const plan=await client.query<{id:string}>("SELECT id FROM app.plans WHERE code='free' AND is_active=true");
    if(!plan.rowCount)throw new Error('Default SaaS plan has not been seeded');
    await client.query("INSERT INTO app.subscriptions(tenant_id,plan_id,status,billing_interval,current_period_start,current_period_end) VALUES($1,$2,'active','month',now(),'infinity'::timestamptz)",[tenant.rows[0].id,plan.rows[0].id]);
    const project=await client.query<{id:string}>("INSERT INTO app.projects(tenant_id,name,slug) VALUES($1,'My first project','my-first-project') RETURNING id",[tenant.rows[0].id]);
    return {userId:user.rows[0].id,tenantId:tenant.rows[0].id,tenantName:tenant.rows[0].name,projectId:project.rows[0].id};
   });
   try{
    await this.sendVerificationEmail(created.userId,input.email.toLowerCase(),input.displayName);
   }catch(error){
    if(error instanceof ServiceUnavailableException)throw error;
    throw new ServiceUnavailableException('Unable to send the verification email');
   }
   return {user:{id:created.userId,email:input.email.toLowerCase(),displayName:input.displayName,emailVerified:false},workspace:{id:created.tenantId,name:created.tenantName},project:{id:created.projectId,name:'My first project'},emailVerificationRequired:true};
  }catch(error){if(typeof error==='object'&&error!==null&&'code'in error&&(error as {code:string}).code==='23505')throw new ConflictException('An account with this email already exists');throw error;}
 }
 async login(input:{email:string;password:string}){
  const result=await this.db.query<UserRow>('SELECT id,email,display_name,password_hash,status,email_verified_at FROM app.users WHERE email=$1 LIMIT 1',[input.email.toLowerCase()]);
  const user=result.rows[0],valid=user?.password_hash?await argon2.verify(user.password_hash,input.password).catch(()=>false):false;
  if(!valid||!user||user.status!=='active')throw new UnauthorizedException('Invalid email or password');
  if(!user.email_verified_at)throw new UnauthorizedException('Email address is not verified');
  const membership=await this.membershipFor(user.id);
  if(!membership)throw new UnauthorizedException('No active workspace membership');
  return {user:{id:user.id,email:user.email,displayName:user.display_name,emailVerified:true},workspace:{id:membership.tenant_id,name:membership.tenant_name},...await this.createSession(user.id,membership.tenant_id,membership.role_code)};
 }
 async verifyEmail(token:string){
  const tokenHash=this.hashToken(token);
  const result=await this.db.withTransaction(async client=>{
   const found=await client.query<{id:string;user_id:string}>("SELECT id,user_id FROM app.email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE",[tokenHash]);
   const row=found.rows[0];
   if(!row)throw new UnauthorizedException('Invalid or expired email verification token');
   await client.query('UPDATE app.users SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1',[row.user_id]);
   await client.query('UPDATE app.email_verification_tokens SET used_at=now() WHERE id=$1',[row.id]);
   return row.user_id;
  });
  return {success:true,userId:result};
 }
 async resendVerification(email:string){
  const result=await this.db.query<{id:string;email:string;display_name:string|null;email_verified_at:Date|null}>('SELECT id,email,display_name,email_verified_at FROM app.users WHERE email=$1 LIMIT 1',[email.toLowerCase()]);
  if(!result.rowCount||result.rows[0].email_verified_at)return {success:true};
  try{
   await this.sendVerificationEmail(result.rows[0].id,result.rows[0].email,result.rows[0].display_name??'there');
  }catch(error){
   if(error instanceof ServiceUnavailableException)throw error;
   throw new ServiceUnavailableException('Unable to send the verification email');
  }
  return {success:true};
 }
 async refresh(refreshToken:string){
  const oldHash=this.hashToken(refreshToken),newToken=randomBytes(48).toString('base64url'),newSessionId=randomUUID();
  const result=await this.db.withTransaction(async client=>{
   const found=await client.query<{id:string;user_id:string;tenant_id:string}>('SELECT id,user_id,tenant_id FROM app.user_sessions WHERE refresh_token_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[oldHash]);
   const session=found.rows[0];if(!session)throw new UnauthorizedException('Invalid or expired refresh token');
   await client.query("SELECT set_config('app.tenant_id',$1,true)",[session.tenant_id]);
   const m=await client.query<Membership>("SELECT tm.tenant_id,t.name tenant_name,r.code role_code FROM app.tenant_members tm JOIN app.tenants t ON t.id=tm.tenant_id JOIN app.roles r ON r.id=tm.role_id JOIN app.users u ON u.id=tm.user_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND t.status='active' AND u.status='active' AND u.email_verified_at IS NOT NULL",[session.tenant_id,session.user_id]);
   if(!m.rows[0])throw new UnauthorizedException('No active verified workspace membership');
   await client.query('UPDATE app.user_sessions SET revoked_at=now() WHERE id=$1',[session.id]);
   const days=Number(this.config.get<string>('REFRESH_TOKEN_TTL_DAYS')??30);
   await client.query("INSERT INTO app.user_sessions(id,user_id,tenant_id,refresh_token_hash,expires_at) VALUES($1,$2,$3,$4,now()+($5::text || ' days')::interval)",[newSessionId,session.user_id,session.tenant_id,this.hashToken(newToken),days]);
   return {userId:session.user_id,...m.rows[0]};
  });
  const accessToken=await this.jwt.signAsync({sub:result.userId,sid:newSessionId,tid:result.tenant_id,role:result.role_code});
  return {accessToken,refreshToken:newToken,tokenType:'Bearer',expiresIn:Number(this.config.get<string>('ACCESS_TOKEN_TTL_SECONDS')??900),workspace:{id:result.tenant_id,name:result.tenant_name}};
 }
 async logout(userId:string,sessionId:string){await this.db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[sessionId,userId]);return {success:true};}
}
