import {BadRequestException,ForbiddenException,HttpException,HttpStatus,Injectable,NotFoundException,ServiceUnavailableException} from '@nestjs/common';
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
  if(!response.ok||!data.access_token)throw new BadRequestException({message:'OAuth token exchange failed',provider,status:response.status});
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
   const member=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.users u ON u.id=tm.user_id JOIN app.tenants t ON t.id=tm.tenant_id JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND u.status='active' AND t.status='active' AND p.code='integration.manage'",[tenantId,row.user_id]);
   if(!member.rowCount)throw new ForbiddenException('Workspace membership or integration permission is no longer active');
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

 private decryptSecret(row:{ciphertext:Buffer;iv:Buffer;auth_tag:Buffer}):any{
  const decipher=createDecipheriv('aes-256-gcm',this.encryptionKey(),row.iv);
  decipher.setAuthTag(row.auth_tag);
  const clear=Buffer.concat([decipher.update(row.ciphertext),decipher.final()]);
  return JSON.parse(clear.toString('utf8'));
 }
 private async connectionCredential(principal:Principal,connectionId:string){
  return this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const r=await client.query<{provider:Provider;status:string;id:string}>("SELECT id,provider,status FROM app.integration_connections WHERE tenant_id=$1 AND id=$2",[principal.tenantId,connectionId]);
   if(!r.rowCount||r.rows[0].status!=='connected')throw new NotFoundException('Active integration connection not found');
   const secret=await client.query<{ciphertext:Buffer;iv:Buffer;auth_tag:Buffer}>("SELECT ciphertext,iv,auth_tag FROM app.integration_secrets WHERE tenant_id=$1 AND connection_id=$2",[principal.tenantId,connectionId]);
   if(!secret.rowCount)throw new NotFoundException('Integration credentials are unavailable');
   return {provider:r.rows[0].provider,credential:this.decryptSecret(secret.rows[0])};
  },principal.tenantId);
 }
 private async refreshCredential(principal:Principal,connectionId:string,provider:Provider,credential:any){
  if(!credential.refreshToken)throw new ForbiddenException('Provider authorization expired; reconnect the account');
  const cfg=this.providerConfig(provider);
  if(!cfg.clientId||!cfg.clientSecret)throw new ServiceUnavailableException('OAuth provider credentials are not configured');
  const body=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,refresh_token:credential.refreshToken,grant_type:'refresh_token'});
  const response=await fetch(cfg.tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body,signal:AbortSignal.timeout(15_000)});
  const text=await response.text();let data:TokenResponse;
  try{data=JSON.parse(text) as TokenResponse;}catch{throw new ServiceUnavailableException('Provider token refresh returned invalid JSON');}
  if(!response.ok||!data.access_token)throw new ForbiddenException('Provider authorization expired; reconnect the account');
  const next={...credential,accessToken:data.access_token,refreshToken:data.refresh_token??credential.refreshToken,expiresAt:new Date(Date.now()+Math.max(60,data.expires_in??3600)*1000).toISOString(),scope:data.scope??credential.scope};
  const encrypted=this.encrypt(next);
  await this.db.withTransaction(async client=>{
   await client.query("UPDATE app.integration_secrets SET ciphertext=$3,iv=$4,auth_tag=$5,updated_at=now() WHERE tenant_id=$1 AND connection_id=$2",[principal.tenantId,connectionId,encrypted.ciphertext,encrypted.iv,encrypted.authTag]);
  },principal.tenantId);
  return next;
 }
 private async accessToken(principal:Principal,connectionId:string,provider:Provider,credential:any):Promise<string>{
  const expires=Date.parse(credential.expiresAt??'1970-01-01T00:00:00Z');
  if(!credential.accessToken||expires<Date.now()+5*60_000){
   credential=await this.refreshCredential(principal,connectionId,provider,credential);
  }
  return credential.accessToken as string;
 }
 private async bingSites(credential:any){
  const url=new URL('https://www.bing.com/webmaster/api.svc/json/GetUserSites');
  const headers:Record<string,string>={'accept':'application/json'};
  if(credential.apiKey)url.searchParams.set('apikey',credential.apiKey);
  else headers.authorization='Bearer '+credential.accessToken;
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(15_000)});
  const text=await response.text();let data:any;
  try{data=JSON.parse(text);}catch{throw new ServiceUnavailableException('Bing Webmaster returned invalid JSON');}
  if(!response.ok||data.ErrorCode||!Array.isArray(data.d))throw new ForbiddenException('Unable to list Bing Webmaster sites; verify the account credentials');
  return data.d.map((site:any)=>({siteUrl:String(site.Url??''),verified:Boolean(site.IsVerified),permission:site.IsVerified?'verified':'unverified'})).filter((site:any)=>site.siteUrl);
 }
 async listSites(principal:Principal,connectionId:string){
  const {provider,credential}=await this.connectionCredential(principal,connectionId);
  if(provider==='bing_webmaster'){
   if(!credential.apiKey)credential.accessToken=await this.accessToken(principal,connectionId,provider,credential);
   return this.bingSites(credential);
  }
  credential.accessToken=await this.accessToken(principal,connectionId,provider,credential);
  const response=await fetch('https://www.googleapis.com/webmasters/v3/sites',{headers:{authorization:'Bearer '+credential.accessToken,accept:'application/json'},signal:AbortSignal.timeout(15_000)});
  const text=await response.text();let data:any;
  try{data=JSON.parse(text);}catch{throw new ServiceUnavailableException('Google Search Console returned invalid JSON');}
  if(!response.ok||!Array.isArray(data.siteEntry))throw new ForbiddenException('Unable to list Search Console properties; verify the Google account permissions');
  return data.siteEntry.map((site:any)=>({siteUrl:String(site.siteUrl??''),verified:true,permission:String(site.permissionLevel??'unknown')})).filter((site:any)=>site.siteUrl);
 }
 async attachSite(principal:Principal,connectionId:string,projectId:string,siteUrl:string){
  const sites=await this.listSites(principal,connectionId),site=sites.find((item:any)=>item.siteUrl===siteUrl);
  if(!site)throw new ForbiddenException('The selected property is not available to this connected account');
  return this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const project=await client.query<{target_url:string|null}>("SELECT target_url FROM app.projects WHERE tenant_id=$1 AND id=$2",[principal.tenantId,projectId]);
   if(!project.rowCount||!project.rows[0].target_url)throw new NotFoundException('Project or target URL not found');
   let target:URL;try{target=new URL(project.rows[0].target_url);}catch{throw new BadRequestException('Project target URL is invalid');}
   let matches=false;
   if(siteUrl.startsWith('sc-domain:')){
    const domain=siteUrl.slice('sc-domain:'.length).toLowerCase();
    matches=target.hostname.toLowerCase()===domain||target.hostname.toLowerCase().endsWith('.'+domain);
   }else{
    try{const property=new URL(siteUrl);matches=target.origin===property.origin&&target.pathname.startsWith(property.pathname);}catch{matches=false;}
   }
   if(!matches)throw new ForbiddenException('The provider property does not cover the project target URL');
   const allowed=site.verified&&(site.permission==='siteOwner'||site.permission==='siteFullUser'||site.permission==='verified');
   const verification=allowed?'verified':'insufficient_permission';
   const r=await client.query("INSERT INTO app.integration_sites(tenant_id,connection_id,project_id,site_url,permission_level,verification_status,last_verified_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='verified' THEN now() ELSE NULL END) ON CONFLICT(tenant_id,project_id,connection_id,site_url) DO UPDATE SET permission_level=EXCLUDED.permission_level,verification_status=EXCLUDED.verification_status,last_verified_at=EXCLUDED.last_verified_at,updated_at=now() RETURNING id,site_url,permission_level,verification_status,last_verified_at",[principal.tenantId,connectionId,projectId,siteUrl,site.permission,verification]);
   return r.rows[0];
  },principal.tenantId);
 }
 async createBingApiKey(principal:Principal,projectId:string,apiKey:string){
  if(!apiKey||apiKey.length<20||apiKey.length>512)throw new BadRequestException('Invalid Bing API key');
  await this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const project=await client.query("SELECT 1 FROM app.projects WHERE tenant_id=$1 AND id=$2",[principal.tenantId,projectId]);
   if(!project.rowCount)throw new NotFoundException('Project not found');
  },principal.tenantId);
  const sites=await this.bingSites({apiKey});
  if(!sites.length)throw new ForbiddenException('The Bing API key has no accessible sites');
  const connectionId=randomUUID(),secretId=randomUUID(),encrypted=this.encrypt({apiKey,authMode:'api_key'});
  await this.db.withTransaction(async client=>{
   const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
   if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
   const project=await client.query("SELECT 1 FROM app.projects WHERE tenant_id=$1 AND id=$2",[principal.tenantId,projectId]);
   if(!project.rowCount)throw new NotFoundException('Project not found');
   await client.query("INSERT INTO app.integration_connections(id,tenant_id,provider,display_name,credential_secret_ref,scopes,status) VALUES($1,$2,'bing_webmaster','Bing Webmaster API key',$3,ARRAY['api_key'],'connected')",[connectionId,principal.tenantId,secretId]);
   await client.query("INSERT INTO app.integration_secrets(id,tenant_id,connection_id,ciphertext,iv,auth_tag,key_version) VALUES($1,$2,$3,$4,$5,$6,'v1')",[secretId,principal.tenantId,connectionId,encrypted.ciphertext,encrypted.iv,encrypted.authTag]);
  },principal.tenantId);
  return {connected:true,provider:'bing_webmaster',connectionId,availableSites:sites.length};
 }

 private normalizeProviderUrl(value:string):string{
  let url:URL;try{url=new URL(value);}catch{throw new BadRequestException('Invalid provider URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new BadRequestException('Only public HTTP(S) URLs are supported');
  url.hash='';if((url.protocol==='https:'&&url.port==='443')||(url.protocol==='http:'&&url.port==='80'))url.port='';
  return url.toString();
 }
 private urlMatchesSite(value:string,siteUrl:string):boolean{
  let target:URL;try{target=new URL(value);}catch{return false;}
  if(siteUrl.startsWith('sc-domain:')){
   const domain=siteUrl.slice(10).toLowerCase();
   return target.hostname.toLowerCase()===domain||target.hostname.toLowerCase().endsWith('.'+domain);
  }
  try{const property=new URL(siteUrl);return target.origin===property.origin&&target.pathname.startsWith(property.pathname);}catch{return false;}
 }
 private async bingSubmissionQuota(principal:Principal,connectionId:string,siteUrl:string){
  const {provider,credential}=await this.connectionCredential(principal,connectionId);
  if(provider!=='bing_webmaster')throw new BadRequestException('This operation requires a Bing Webmaster connection');
  if(!credential.apiKey)credential.accessToken=await this.accessToken(principal,connectionId,provider,credential);
  const endpoint=new URL('https://www.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota');
  endpoint.searchParams.set('siteUrl',siteUrl);if(credential.apiKey)endpoint.searchParams.set('apikey',credential.apiKey);
  const headers:Record<string,string>={'accept':'application/json'};if(!credential.apiKey)headers.authorization='Bearer '+credential.accessToken;
  const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(15_000)});
  let data:any;try{data=JSON.parse(await response.text());}catch{throw new ServiceUnavailableException('Bing quota endpoint returned invalid JSON');}
  const daily=Number(data?.d?.DailyQuota),monthly=Number(data?.d?.MonthlyQuota);
  if(!response.ok||data?.ErrorCode||!Number.isFinite(daily)||!Number.isFinite(monthly)||daily<1||monthly<1)throw new ForbiddenException('Unable to retrieve the live Bing URL submission quota');
  return {daily,monthly};
 }
 private async assertProviderSite(client:any,principal:Principal,connectionId:string,projectId:string,provider:Provider,siteUrl:string){
  const permission=await client.query("SELECT 1 FROM app.tenant_members tm JOIN app.role_permissions rp ON rp.role_id=tm.role_id JOIN app.permissions p ON p.id=rp.permission_id WHERE tm.tenant_id=$1 AND tm.user_id=$2 AND tm.status='active' AND p.code='integration.manage'",[principal.tenantId,principal.userId]);
  if(!permission.rowCount)throw new ForbiddenException('Integration management permission required');
  const connection=await client.query("SELECT 1 FROM app.integration_connections WHERE tenant_id=$1 AND id=$2 AND provider=$3 AND status='connected'",[principal.tenantId,connectionId,provider]);
  if(!connection.rowCount)throw new NotFoundException('Connected provider account not found');
  const project=await client.query("SELECT 1 FROM app.projects WHERE tenant_id=$1 AND id=$2 AND status='active'",[principal.tenantId,projectId]);
  if(!project.rowCount)throw new NotFoundException('Project not found');
  const site=await client.query("SELECT 1 FROM app.integration_sites WHERE tenant_id=$1 AND connection_id=$2 AND project_id=$3 AND site_url=$4 AND verification_status='verified'",[principal.tenantId,connectionId,projectId,siteUrl]);
  if(!site.rowCount)throw new ForbiddenException('Bind a verified provider property to this project first');
 }
 private async insertProviderJobs(client:any,principal:Principal,projectId:string,connectionId:string,provider:Provider,action:'inspect'|'submit_url',siteUrl:string,urls:string[],idempotencyKeys:string[]){
  const existing=await client.query("SELECT idempotency_key FROM app.provider_jobs WHERE tenant_id=$1 AND idempotency_key=ANY($2::text[])",[principal.tenantId,idempotencyKeys]);
  const seen=new Set(existing.rows.map((row:any)=>row.idempotency_key));
  const pending=urls.map((url,index)=>({url,key:idempotencyKeys[index]})).filter(item=>!seen.has(item.key));
  for(const item of pending){
   await client.query("INSERT INTO app.provider_jobs(tenant_id,project_id,connection_id,provider,action,status,url,site_url,idempotency_key) VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING",[principal.tenantId,projectId,connectionId,provider,action,item.url,siteUrl,item.key]);
  }
  if(pending.length){
   const eventKey='provider-batch:'+randomUUID();
   const payload=JSON.stringify({tenantId:principal.tenantId,projectId,connectionId,provider,siteUrl});
   await client.query("INSERT INTO app.outbox_events(tenant_id,aggregate_type,aggregate_id,event_type,topic,partition_key,payload,idempotency_key) VALUES($1,'provider_batch',$2,'provider.jobs.queued','provider.jobs',$3,$4::jsonb,$5) ON CONFLICT(idempotency_key) DO NOTHING",[principal.tenantId,projectId,principal.tenantId+':'+projectId+':'+connectionId,payload,eventKey]);
  }
  return pending.length;
 }
 async queueGoogleInspections(principal:Principal,connectionId:string,input:{projectId:string;siteUrl:string;urls:string[]}){
  const {provider}=await this.connectionCredential(principal,connectionId);
  if(provider!=='google_search_console')throw new BadRequestException('This operation requires a Google Search Console connection');
  const siteUrl=input.siteUrl,urls=[...new Set(input.urls.map(url=>this.normalizeProviderUrl(url)))];
  if(urls.length>500)throw new BadRequestException('Maximum 500 URLs per inspection batch');
  if(urls.some(url=>!this.urlMatchesSite(url,siteUrl)))throw new ForbiddenException('Every inspected URL must belong to the selected verified Search Console property');
  const dayStart=new Date();dayStart.setUTCHours(0,0,0,0);
  const minuteStart=new Date(Date.now()-60_000);
  const configuredDaily=Number(this.config.get<string>('GOOGLE_INSPECTION_DAILY_LIMIT')??2000),configuredMinute=Number(this.config.get<string>('GOOGLE_INSPECTION_PER_MINUTE_LIMIT')??600);
  const dailyLimit=Number.isFinite(configuredDaily)?Math.min(2000,Math.max(1,configuredDaily)):2000;
  const minuteLimit=Number.isFinite(configuredMinute)?Math.min(600,Math.max(1,configuredMinute)):600;
  const keys=urls.map(url=>'gsc-inspect:'+connectionId+':'+createHash('sha256').update(siteUrl+'|'+url).digest('hex')+':'+dayStart.toISOString().slice(0,10));
  return this.db.withTransaction(async client=>{
   await this.assertProviderSite(client,principal,connectionId,input.projectId,'google_search_console',siteUrl);
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[principal.tenantId+':'+connectionId+':'+siteUrl+':'+dayStart.toISOString().slice(0,10)]);
   const existing=await client.query("SELECT idempotency_key FROM app.provider_jobs WHERE tenant_id=$1 AND idempotency_key=ANY($2::text[])",[principal.tenantId,keys]);
   const seen=new Set(existing.rows.map((row:any)=>row.idempotency_key));
   const pending=urls.filter((url,index)=>!seen.has(keys[index]));
   const counts=await client.query("SELECT count(*) FILTER(WHERE created_at >= $3)::int daily,count(*) FILTER(WHERE created_at >= $4)::int minute FROM app.provider_jobs WHERE tenant_id=$1 AND site_url=$2 AND provider='google_search_console' AND action='inspect' AND status<>'cancelled'",[principal.tenantId,siteUrl,dayStart,minuteStart]);
   const daily=counts.rows[0].daily,minute=counts.rows[0].minute;
   if(daily+pending.length>dailyLimit||minute+pending.length>minuteLimit)throw new HttpException({message:'Google Search Console inspection quota would be exceeded',dailyLimit,dailyUsed:daily,perMinuteLimit:minuteLimit,minuteUsed:minute},HttpStatus.TOO_MANY_REQUESTS);
   const queued=await this.insertProviderJobs(client,principal,input.projectId,connectionId,'google_search_console','inspect',siteUrl,urls,keys);
   return {provider:'google_search_console',action:'inspect',queued,duplicate:urls.length-queued,quota:{dailyLimit,dailyUsed:daily+queued,perMinuteLimit:minuteLimit,minuteUsed:minute+queued},note:'Inspection results are not indexing requests.'};
  },principal.tenantId);
 }
 async queueBingSubmissions(principal:Principal,connectionId:string,input:{projectId:string;siteUrl:string;urls:string[]}){
  const urls=[...new Set(input.urls.map(url=>this.normalizeProviderUrl(url)))];
  if(urls.length>500)throw new BadRequestException('Bing URL submission supports at most 500 URLs per batch');
  if(urls.some(url=>!this.urlMatchesSite(url,input.siteUrl)))throw new ForbiddenException('Every submitted URL must belong to the selected verified Bing site');
  await this.db.withTransaction(client=>this.assertProviderSite(client,principal,connectionId,input.projectId,'bing_webmaster',input.siteUrl),principal.tenantId);
  const quota=await this.bingSubmissionQuota(principal,connectionId,input.siteUrl);
  const now=new Date(),dayStart=new Date(now);dayStart.setUTCHours(0,0,0,0);
  const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const keys=urls.map(url=>'bing-submit:'+connectionId+':'+createHash('sha256').update(input.siteUrl+'|'+url).digest('hex')+':'+dayStart.toISOString().slice(0,10));
  return this.db.withTransaction(async client=>{
   await this.assertProviderSite(client,principal,connectionId,input.projectId,'bing_webmaster',input.siteUrl);
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[principal.tenantId+':'+connectionId+':'+input.siteUrl+':'+dayStart.toISOString().slice(0,10)]);
   const existing=await client.query("SELECT idempotency_key FROM app.provider_jobs WHERE tenant_id=$1 AND idempotency_key=ANY($2::text[])",[principal.tenantId,keys]);
   const seen=new Set(existing.rows.map((row:any)=>row.idempotency_key));
   const pending=urls.filter((url,index)=>!seen.has(keys[index]));
   const counts=await client.query("SELECT count(*) FILTER(WHERE created_at >= $4)::int daily,count(*) FILTER(WHERE created_at >= $5)::int monthly FROM app.provider_jobs WHERE tenant_id=$1 AND connection_id=$2 AND site_url=$3 AND provider='bing_webmaster' AND action='submit_url' AND status<>'cancelled'",[principal.tenantId,connectionId,input.siteUrl,dayStart,monthStart]);
   const daily=counts.rows[0].daily,monthly=counts.rows[0].monthly;
   if(daily+pending.length>quota.daily||monthly+pending.length>quota.monthly)throw new HttpException({message:'Bing Webmaster submission quota would be exceeded',dailyLimit:quota.daily,dailyUsed:daily,monthlyLimit:quota.monthly,monthlyUsed:monthly},HttpStatus.TOO_MANY_REQUESTS);
   const queued=await this.insertProviderJobs(client,principal,input.projectId,connectionId,'bing_webmaster','submit_url',input.siteUrl,urls,keys);
   return {provider:'bing_webmaster',action:'submit_url',queued,duplicate:urls.length-queued,quota:{dailyLimit:quota.daily,dailyUsed:daily+queued,monthlyLimit:quota.monthly,monthlyUsed:monthly+queued},note:'Provider acceptance does not mean the URL is indexed.'};
  },principal.tenantId);
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
