import { ConflictException, Injectable, UnauthorizedException, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.module';
import { EmailService } from './email.service';

type Membership={tenant_id:string;tenant_name:string;role_code:string};
type UserRow={id:string;email:string;display_name:string|null;password_hash:string;status:string;email_verified_at:Date|null;mfa_enabled:boolean};

@Injectable()
export class AuthService{
 constructor(private readonly db:DatabaseService,private readonly jwt:JwtService,private readonly config:ConfigService,private readonly email:EmailService){}

 private hashToken(token:string):Buffer{return createHash('sha256').update(token,'utf8').digest();}

 private encryptionKey():Buffer{
  const value=this.config.get<string>('INTEGRATION_ENCRYPTION_KEY')??'';
  if(!/^[a-fA-F0-9]{64}$/.test(value))throw new ServiceUnavailableException('INTEGRATION_ENCRYPTION_KEY must be 32-byte hex');
  return Buffer.from(value,'hex');
 }

 private encryptSecret(value:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return {ciphertext,iv,authTag:cipher.getAuthTag()};
 }

 private decryptSecret(row:{secret_ciphertext:Buffer;secret_iv:Buffer;secret_auth_tag:Buffer}):string{
  const decipher=createDecipheriv('aes-256-gcm',this.encryptionKey(),row.secret_iv);
  decipher.setAuthTag(row.secret_auth_tag);
  return Buffer.concat([decipher.update(row.secret_ciphertext),decipher.final()]).toString('utf8');
 }

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

 private async createAuthToken(userId:string,purpose:'password_reset'|'mfa_login'|'mfa_recovery',expiresIn:string):Promise<string>{
  const token=randomBytes(32).toString('base64url');
  await this.db.query("INSERT INTO app.auth_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,now()+$4::interval)",[userId,purpose,this.hashToken(token),expiresIn]);
  return token;
 }

 private base32Encode(bytes:Buffer):string{
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits=0,value=0,out='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>(bits-5))&31];bits-=5;}}
  if(bits>0)out+=alphabet[(value<<(5-bits))&31];
  return out;
 }

 private base32Decode(input:string):Buffer{
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',normalized=input.replace(/=+$/,'').toUpperCase();
  let bits=0,value=0,out:number[]=[];
  for(const char of normalized){const index=alphabet.indexOf(char);if(index<0)throw new BadRequestException('Invalid MFA secret');value=(value<<5)|index;bits+=5;if(bits>=8){out.push((value>>(bits-8))&255);bits-=8;}}
  return Buffer.from(out);
 }

 private totp(secret:string,offset=0):string{
  const counter=Math.floor(Date.now()/1000/30)+offset;
  const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(counter));
  const mac=createHmac('sha1',this.base32Decode(secret)).update(msg).digest();
  const index=mac[mac.length-1]&15;
  const binary=((mac[index]&127)<<24)|(mac[index+1]<<16)|(mac[index+2]<<8)|mac[index+3];
  return String(binary%1_000_000).padStart(6,'0');
 }

 private verifyTotp(secret:string,code:string):boolean{
  return [-1,0,1].some(offset=>{
   const expected=Buffer.from(this.totp(secret,offset)),received=Buffer.from(code);
   return expected.length===received.length&&timingSafeEqual(expected,received);
  });
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
   try{await this.sendVerificationEmail(created.userId,input.email.toLowerCase(),input.displayName);}
   catch(error){if(error instanceof ServiceUnavailableException)throw error;throw new ServiceUnavailableException('Unable to send the verification email');}
   return {user:{id:created.userId,email:input.email.toLowerCase(),displayName:input.displayName,emailVerified:false},workspace:{id:created.tenantId,name:created.tenantName},project:{id:created.projectId,name:'My first project'},emailVerificationRequired:true};
  }catch(error){if(typeof error==='object'&&error!==null&&'code'in error&&(error as {code:string}).code==='23505')throw new ConflictException('An account with this email already exists');throw error;}
 }

 async login(input:{email:string;password:string}){
  const result=await this.db.query<UserRow>('SELECT id,email,display_name,password_hash,status,email_verified_at,mfa_enabled FROM app.users WHERE email=$1 LIMIT 1',[input.email.toLowerCase()]);
  const user=result.rows[0],valid=user?.password_hash?await argon2.verify(user.password_hash,input.password).catch(()=>false):false;
  if(!valid||!user||user.status!=='active')throw new UnauthorizedException('Invalid email or password');
  if(!user.email_verified_at)throw new UnauthorizedException('Email address is not verified');
  const membership=await this.membershipFor(user.id);
  if(!membership)throw new UnauthorizedException('No active workspace membership');
  if(user.mfa_enabled){
   const challengeToken=await this.createAuthToken(user.id,'mfa_login','10 minutes');
   return {mfaRequired:true,challengeToken,tokenType:'Bearer',expiresIn:600};
  }
  return {user:{id:user.id,email:user.email,displayName:user.display_name,emailVerified:true,mfaEnabled:false},workspace:{id:membership.tenant_id,name:membership.tenant_name},...await this.createSession(user.id,membership.tenant_id,membership.role_code)};
 }

 async completeMfaLogin(challengeToken:string,code:string){
  const result=await this.db.withTransaction(async client=>{
   const found=await client.query<{id:string;user_id:string}>("SELECT id,user_id FROM app.auth_tokens WHERE token_hash=$1 AND purpose='mfa_login' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[this.hashToken(challengeToken)]);
   if(!found.rowCount)throw new UnauthorizedException('Invalid or expired MFA challenge');
   const user=await client.query<{id:string;email:string;display_name:string|null;tenant_id:string;tenant_name:string;role_code:string;secret_ciphertext:Buffer;secret_iv:Buffer;secret_auth_tag:Buffer}>("SELECT u.id,u.email,u.display_name,tm.tenant_id,t.name tenant_name,r.code role_code,m.secret_ciphertext,m.secret_iv,m.secret_auth_tag FROM app.users u JOIN app.tenant_members tm ON tm.user_id=u.id AND tm.status='active' JOIN app.tenants t ON t.id=tm.tenant_id AND t.status='active' JOIN app.roles r ON r.id=tm.role_id JOIN app.mfa_credentials m ON m.user_id=u.id WHERE u.id=$1 AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.mfa_enabled=true ORDER BY tm.joined_at ASC LIMIT 1",[found.rows[0].user_id]);
   if(!user.rowCount)throw new UnauthorizedException('MFA account is unavailable');
   if(!this.verifyTotp(this.decryptSecret(user.rows[0]),code))throw new UnauthorizedException('Invalid MFA code');
   await client.query("UPDATE app.auth_tokens SET consumed_at=now() WHERE id=$1",[found.rows[0].id]);
   return user.rows[0];
  });
  return {user:{id:result.id,email:result.email,displayName:result.display_name,emailVerified:true,mfaEnabled:true},workspace:{id:result.tenant_id,name:result.tenant_name},...await this.createSession(result.id,result.tenant_id,result.role_code)};
 }

 async recoverMfaLogin(challengeToken:string,recoveryCode:string){
  const result=await this.db.withTransaction(async client=>{
   const challenge=await client.query<{id:string;user_id:string}>("SELECT id,user_id FROM app.auth_tokens WHERE token_hash=$1 AND purpose='mfa_login' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[this.hashToken(challengeToken)]);
   if(!challenge.rowCount)throw new UnauthorizedException('Invalid or expired MFA challenge');
   const codeHash=this.hashToken(recoveryCode.trim().toUpperCase());
   const code=await client.query<{id:string}>("SELECT id FROM app.auth_tokens WHERE user_id=$1 AND purpose='mfa_recovery' AND token_hash=$2 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[challenge.rows[0].user_id,codeHash]);
   if(!code.rowCount)throw new UnauthorizedException('Invalid or already used recovery code');
   const user=await client.query<{id:string;email:string;display_name:string|null;tenant_id:string;tenant_name:string;role_code:string}>("SELECT u.id,u.email,u.display_name,tm.tenant_id,t.name tenant_name,r.code role_code FROM app.users u JOIN app.tenant_members tm ON tm.user_id=u.id AND tm.status='active' JOIN app.tenants t ON t.id=tm.tenant_id AND t.status='active' JOIN app.roles r ON r.id=tm.role_id WHERE u.id=$1 AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.mfa_enabled=true ORDER BY tm.joined_at ASC LIMIT 1",[challenge.rows[0].user_id]);
   if(!user.rowCount)throw new UnauthorizedException('MFA account is unavailable');
   await client.query("UPDATE app.auth_tokens SET consumed_at=now() WHERE id=$1",[code.rows[0].id]);
   await client.query("UPDATE app.auth_tokens SET consumed_at=now() WHERE id=$1",[challenge.rows[0].id]);
   return user.rows[0];
  });
  return {user:{id:result.id,email:result.email,displayName:result.display_name,emailVerified:true,mfaEnabled:true},workspace:{id:result.tenant_id,name:result.tenant_name},...await this.createSession(result.id,result.tenant_id,result.role_code)};
 }

 async setupMfa(userId:string){
  const user=await this.db.query<{email:string;mfa_enabled:boolean}>('SELECT email,mfa_enabled FROM app.users WHERE id=$1 AND status=\'active\' AND email_verified_at IS NOT NULL',[userId]);
  if(!user.rowCount)throw new UnauthorizedException('User account is unavailable');
  if(user.rows[0].mfa_enabled)throw new ConflictException('MFA is already enabled');
  const secret=this.base32Encode(randomBytes(20));
  const encrypted=this.encryptSecret(secret);
  await this.db.query("INSERT INTO app.mfa_credentials(user_id,secret_ciphertext,secret_iv,secret_auth_tag,key_version,enrolled_at) VALUES($1,$2,$3,$4,'v1',NULL) ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=EXCLUDED.secret_ciphertext,secret_iv=EXCLUDED.secret_iv,secret_auth_tag=EXCLUDED.secret_auth_tag,key_version='v1',enrolled_at=NULL,updated_at=now()",[userId,encrypted.ciphertext,encrypted.iv,encrypted.authTag]);
  const issuer='Index Assist',label=encodeURIComponent(user.rows[0].email);
  return {mfaEnabled:false,secret,otpauthUri:'otpauth://totp/'+issuer+':'+label+'?secret='+secret+'&issuer='+encodeURIComponent(issuer)+'&algorithm=SHA1&digits=6&period=30'};
 }

 async verifyMfa(userId:string,code:string){
  const row=await this.db.query<{secret_ciphertext:Buffer;secret_iv:Buffer;secret_auth_tag:Buffer}>("SELECT secret_ciphertext,secret_iv,secret_auth_tag FROM app.mfa_credentials WHERE user_id=$1",[userId]);
  if(!row.rowCount)throw new BadRequestException('MFA enrollment has not been started');
  if(!this.verifyTotp(this.decryptSecret(row.rows[0]),code))throw new UnauthorizedException('Invalid MFA code');
  const recoveryCodes=Array.from({length:10},()=>randomBytes(5).toString('hex').toUpperCase());
  await this.db.withTransaction(async client=>{
   await client.query("UPDATE app.users SET mfa_enabled=true,updated_at=now() WHERE id=$1",[userId]);
   await client.query("UPDATE app.mfa_credentials SET enrolled_at=now(),updated_at=now() WHERE user_id=$1",[userId]);
   await client.query("DELETE FROM app.auth_tokens WHERE user_id=$1 AND purpose='mfa_recovery' AND consumed_at IS NULL",[userId]);
   for(const code of recoveryCodes)await client.query("INSERT INTO app.auth_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,'mfa_recovery',$2,now()+interval '10 years')",[userId,this.hashToken(code)]);
  });
  return {mfaEnabled:true,recoveryCodes};
 }

 async disableMfa(userId:string,password:string,code:string){
  const user=await this.db.query<{password_hash:string;mfa_enabled:boolean}>("SELECT password_hash,mfa_enabled FROM app.users WHERE id=$1 AND status='active'",[userId]);
  if(!user.rowCount||!user.rows[0].mfa_enabled||!(await argon2.verify(user.rows[0].password_hash,password).catch(()=>false)))throw new UnauthorizedException('Invalid password or MFA state');
  const secret=await this.db.query<{secret_ciphertext:Buffer;secret_iv:Buffer;secret_auth_tag:Buffer}>('SELECT secret_ciphertext,secret_iv,secret_auth_tag FROM app.mfa_credentials WHERE user_id=$1',[userId]);
  if(!secret.rowCount||!this.verifyTotp(this.decryptSecret(secret.rows[0]),code))throw new UnauthorizedException('Invalid MFA code');
  await this.db.withTransaction(async client=>{
   await client.query("UPDATE app.users SET mfa_enabled=false,updated_at=now() WHERE id=$1",[userId]);
   await client.query("DELETE FROM app.mfa_credentials WHERE user_id=$1",[userId]);
   await client.query("DELETE FROM app.auth_tokens WHERE user_id=$1 AND purpose IN ('mfa_recovery','mfa_login')",[userId]);
   await client.query("UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[userId]);
  });
  return {mfaEnabled:false,sessionsRevoked:true};
 }

 async requestPasswordReset(email:string){
  const result=await this.db.query<{id:string;email:string;display_name:string|null;email_verified_at:Date|null;status:string}>("SELECT id,email,display_name,email_verified_at,status FROM app.users WHERE email=$1 LIMIT 1",[email.toLowerCase()]);
  if(!result.rowCount||result.rows[0].status!=='active'||!result.rows[0].email_verified_at)return {success:true};
  const token=await this.createAuthToken(result.rows[0].id,'password_reset','30 minutes');
  try{await this.email.sendPasswordResetEmail(result.rows[0].email,result.rows[0].display_name??'there',token);}
  catch(error){if(error instanceof ServiceUnavailableException)throw error;throw new ServiceUnavailableException('Unable to send the password reset email');}
  return {success:true};
 }

 async resetPassword(token:string,password:string){
  const result=await this.db.withTransaction(async client=>{
   const found=await client.query<{id:string;user_id:string}>("SELECT id,user_id FROM app.auth_tokens WHERE token_hash=$1 AND purpose='password_reset' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[this.hashToken(token)]);
   if(!found.rowCount)throw new UnauthorizedException('Invalid or expired password reset token');
   const passwordHash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
   await client.query("UPDATE app.users SET password_hash=$2,updated_at=now() WHERE id=$1",[found.rows[0].user_id,passwordHash]);
   await client.query("UPDATE app.auth_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='password_reset' AND consumed_at IS NULL",[found.rows[0].user_id]);
   await client.query("UPDATE app.auth_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='mfa_login' AND consumed_at IS NULL",[found.rows[0].user_id]);
   await client.query("UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[found.rows[0].user_id]);
   return found.rows[0].user_id;
  });
  return {success:true,userId:result,sessionsRevoked:true};
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
  try{await this.sendVerificationEmail(result.rows[0].id,result.rows[0].email,result.rows[0].display_name??'there');}
  catch(error){if(error instanceof ServiceUnavailableException)throw error;throw new ServiceUnavailableException('Unable to send the verification email');}
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

 async listSessions(userId:string){
  const result=await this.db.query<{id:string;tenant_id:string;created_at:Date;last_seen_at:Date;expires_at:Date;revoked_at:Date|null;ip_address:string|null;user_agent:string|null}>("SELECT id,tenant_id,created_at,last_seen_at,expires_at,revoked_at,ip_address::text,user_agent FROM app.user_sessions WHERE user_id=$1 ORDER BY created_at DESC",[userId]);
  return result.rows.map(row=>({id:row.id,tenantId:row.tenant_id,createdAt:row.created_at,lastSeenAt:row.last_seen_at,expiresAt:row.expires_at,revokedAt:row.revoked_at,ipAddress:row.ip_address,userAgent:row.user_agent,active:!row.revoked_at&&new Date(row.expires_at).getTime()>Date.now()}));
 }
 async revokeSession(userId:string,sessionId:string){
  const result=await this.db.query("UPDATE app.user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id",[sessionId,userId]);
  if(!result.rowCount)throw new UnauthorizedException('Session not found or already revoked');
  return {success:true,sessionId};
 }
 async revokeAllSessions(userId:string,exceptSessionId?:string){
  const result=exceptSessionId
   ? await this.db.query("UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",[userId,exceptSessionId])
   : await this.db.query("UPDATE app.user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[userId]);
  return {success:true,revokedCount:result.rowCount??0};
 }
 async logout(userId:string,sessionId:string){await this.db.query('UPDATE app.user_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL',[sessionId,userId]);return {success:true};}
}
