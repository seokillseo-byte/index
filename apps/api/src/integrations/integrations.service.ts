import {BadRequestException,ForbiddenException,Injectable,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {createCipheriv,createDecipheriv,createHmac,randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseService} from '../database/database.module';
type Provider='google_search_console'|'bing_webmaster';
type Principal={userId:string;tenantId:string};
type TokenResponse={access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;token_type?:string};
@Injectable()
export class IntegrationsService{
 constructor(private readonly db:DatabaseService,private readonly config:ConfigService){}
 private providerConfig(provider:Provider){
  if(provider==='google_search_console'){
   return {clientId:this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID'),clientSecret:this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET'),redirectUri:this.config.get<string>('GOOGLE_OAUTH_REDIRECT_URI'),authorizeUrl:'https://accounts.google.com/o/oauth2/v2/auth',tokenUrl:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/webmasters.readonly',name:'Google Search Console'};
  }
  return {clientId:this.config.get<string>('BING_OAUTH_CLIENT_ID'),clientSecret:this.config.get<string>('BING_OAUTH_CLIENT_SECRET'),redirectUri:this.config.get<string>('BING_OAUTH_REDIRECT_URI'),authorizeUrl:'https://www.bing.com/webmasters/oauth/authorize',tokenUrl:'https://www.bing.com/webmasters/oauth/token',scope:'Webmaster.manage',name:'Bing Webmaster Tools'};
 }
 private requireProvider(value:string):Provider{
  if(value!=='google_search_console'&&value!=='bing_webmaster')throw new BadRequestException('Unsupported search provider');
  return value;
 }
 private signState(payload:string){
  const secret=this.config.get<string>('OAUTH_STATE_SECRET');
  if(!secret||secret.length<48)throw new ServiceUnavailableException('OAuth state signing is not configured');
  return createHmac('sha256',secret).update(payload).digest('base64url');
 }
 private makeState(tenantId:string,provider:Provider){
  const payload=Buffer.from(JSON.stringify({tenantId,provider,nonce:randomBytes(32).toString('base64url'),issuedAt:Date.now()})).toString('base64url');
  return payload+'.'+this.signState(payload);
 }
 private parseState(state:string,provider:Provider):{tenantId:string}{
  const parts=state.split('.');
  if(parts.length!==2)throw new BadRequestException('Invalid OAuth state');
  const expected=Buffer.from(this.signState(parts[0]));
  const received=Buffer.from(parts[1]);
  if(expected.length!==received.length||!timingSafeEqual(expected,received))throw new BadRequestException('Invalid OAuth state signature');
  let payload:{tenantId:string;provider:Provider;issuedAt:number};
  try{payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));}catch{throw new BadRequestException('Invalid OAuth state payload');}
  if(payload.provider!==provider||!payload.tenantId||!Number.isFinite(payload.issuedAt)||Date.now()-payload.issuedAt>10*60_000||payload.issuedAt>Date.now()+60_000)throw new BadRequestException('OAuth state expired or mismatched');
  return {tenantId:payload.tenantId};
 }
 private encryptionKey():Buffer{
  const value=this.config.get<string>('INTEGRATION_ENCRYPTION_KEY')??'';
  if(!/^[a-fA-F0-9]{64}$/.test(value))throw new ServiceUnavailableException('INTEGRATION_ENCRYPTION_KEY must be 32-byte hex');
  return Buffer.from(value,'hex');
 }
 private encrypt(value:unknown){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {iv,ciphertext,authTag:cipher.getAuthTag()};
 }
 private async exchangeCode(provider:Provider,code:string):Promise<TokenResponse>{
  const cfg=this.providerConfig(provider);
  if(!cfg.clientId||!cfg.clientSecret||!cfg.redirectUri)throw new ServiceUnavailableException('OAuth provider credentials are not configured');
  const body=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,code,redirect_uri:cfg.redirectUri,grant_type:'authorization_code'});
  const response=await fetch(cfg.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body,signal:AbortSignal.timeout(15_000)});
  const text=await response.text();let data:TokenResponse;
  try{data=JSON.parse(text) as TokenResponse;}catch{throw new ServiceUnavailableException('OAuth provider returned an invalid token response');}
  if(!response.ok||!data.access_token)throw new BadRequestException({message:'OAuth token exchange failed',provider,status:response.status,details:provider==='google_search_console'?data:text.slice(0,500)});
  return data;
 }
 async connect(principal:Principal,projectId:string,providerValue:string){
  const provider=this.requireProvider(providerValue),cfg=this.providerConfig(provider);
  if(!cfg.clientId||!cfg.clientSecret||!cfg.redirectUri)throw new ServiceUnavailableException('OAuth provider credentials are not configured');
  const state=this.makeState(principal.tenantId,provider),stateHash=createHash('sha256').update(state).digest();
  await this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const project=await client.query("SELECT 1 FROM app.projects WHERE tenant_id=$1 AND id=$2 AND status='active'",[principal.tenantId,projectId]);
   if(!project.rowCount)throw new NotFoundException('Project not found');
   await client.query("INSERT INTO app.integration_oauth_states(tenant_id,user_id,project_id,provider,state_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",[principal.tenantId,principal.userId,projectId,provider,stateHash]);
  },principal.tenantId);
  const url=new URL(cfg.authorizeUrl);
  url.searchParams.set('client_id',cfg.clientId);url.searchParams.set('redirect_uri',cfg.redirectUri);
  url.searchParams.set('response_type','code');url.searchParams.set('scope',cfg.scope);url.searchParams.set('state',state);
  if(provider==='google_search_console'){url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('include_granted_scopes','true');}
  return {provider,authorizationUrl:url.toString(),expiresInSeconds:600};
 }
 async callback(providerValue:string,code:string,state:string){
  const provider=this.requireProvider(providerValue);
  if(!code||!state)throw new BadRequestException('OAuth code and state are required');
  const {tenantId}=this.parseState(state,provider),stateHash=createHash('sha256').update(state).digest();
  const pending=await this.db.withTransaction(async client=>{
   const found=await client.query<{id:string;user_id:string;project_id:string}>("SELECT id,user_id,project_id FROM app.integration_oauth_states WHERE tenant_id=$1 AND provider=$2 AND state_hash=$3 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",[tenantId,provider,stateHash]);
   if(!found.rowCount)throw new BadRequestException('OAuth state was already used or has expired');
   const row=found.rows[0];
   const member=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.users u ON u.id=tm.user_id JOIN app.tenants t ON t.id=tm.tenant_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND u.status='active' AND t.status='active'",[tenantId,row.user_id]);
   if(!member.rowCount)throw new ForbiddenException('Workspace membership is no longer active');
   await client.query("UPDATE app.integration_oauth_states SET consumed_at=now() WHERE id=$1",[row.id]);
   return row;
  },tenantId);
  const tokens=await this.exchangeCode(provider,code),cfg=this.providerConfig(provider);
  const connectionId=randomUUID(),secretId=randomUUID();
  const expiresAt=new Date(Date.now()+Math.max(60,tokens.expires_in??3600)*1000);
  const secret=this.encrypt({accessToken:tokens.access_token,refreshToken:tokens.refresh_token??null,expiresAt:expiresAt.toISOString(),scope:tokens.scope??cfg.scope,tokenType:tokens.token_type??'Bearer'});
  await this.db.withTransaction(async client=>{
   const connection=await client.query("INSERT INTO app.integration_connections(id,tenant_id,provider,display_name,credential_secret_ref,scopes,status) VALUES($1,$2,$3,$4,$5,$6,'connected') RETURNING id",[connectionId,tenantId,provider,cfg.name,secretId,tokens.scope?tokens.scope.split(' '):[cfg.scope]]);
   await client.query("INSERT INTO app.integration_secrets(id,tenant_id,connection_id,ciphertext,iv,auth_tag,key_version) VALUES($1,$2,$3,$4,$5,$6,'v1')",[secretId,tenantId,connection.rows[0].id,secret.ciphertext,secret.iv,secret.authTag]);
  },tenantId);
  return {connected:true,provider,connectionId,projectId:pending.project_id,expiresAt:expiresAt.toISOString(),message:'Account connected. Select a verified provider property before enabling inspections or submissions.'};
 }
 async list(principal:Principal){
  return this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const rows=await client.query("SELECT id,provider,display_name,scopes,status,created_at,updated_at FROM app.integration_connections WHERE tenant_id=$1 ORDER BY created_at DESC",[principal.tenantId]);
   return rows.rows;
  },principal.tenantId);
 }
 async disconnect(principal:Principal,connectionId:string){
  return this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const result=await client.query("UPDATE app.integration_connections SET status='revoked',credential_secret_ref='revoked',updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id",[principal.tenantId,connectionId]);
   if(!result.rowCount)throw new NotFoundException('Integration connection not found');
   await client.query("DELETE FROM app.integration_secrets WHERE tenant_id=$1 AND connection_id=$2",[principal.tenantId,connectionId]);
   return {disconnected:true,connectionId};
  },principal.tenantId);
 }
}
