import {Injectable,ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

@Injectable()
export class EmailService{
 constructor(private readonly config:ConfigService){}

 private async send(to:string,subject:string,html:string):Promise<void>{
  const apiKey=this.config.get<string>('RESEND_API_KEY');
  const from=this.config.get<string>('EMAIL_FROM');
  if(!apiKey||!from)throw new ServiceUnavailableException('Transactional email is not configured');
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
   body:JSON.stringify({from,to:[to],subject,html}),
   signal:AbortSignal.timeout(15_000),
  });
  if(!response.ok)throw new ServiceUnavailableException('Transactional email provider rejected the message');
 }

 async sendVerificationEmail(to:string,displayName:string,token:string):Promise<void>{
  const baseUrl=this.config.get<string>('APP_BASE_URL');
  if(!baseUrl)throw new ServiceUnavailableException('APP_BASE_URL is not configured');
  const verificationUrl=new URL('/verify-email',baseUrl);
  verificationUrl.searchParams.set('token',token);
  await this.send(to,'Verify your Index Assist email address',
   '<p>Hello '+this.escapeHtml(displayName)+',</p><p>Verify your Index Assist email address to activate your account.</p><p><a href="'+verificationUrl.toString()+'">Verify email address</a></p><p>This link expires in 30 minutes.</p>');
 }

 async sendPasswordResetEmail(to:string,displayName:string,token:string):Promise<void>{
  const baseUrl=this.config.get<string>('APP_BASE_URL');
  if(!baseUrl)throw new ServiceUnavailableException('APP_BASE_URL is not configured');
  const resetUrl=new URL('/reset-password',baseUrl);
  resetUrl.searchParams.set('token',token);
  await this.send(to,'Reset your Index Assist password',
   '<p>Hello '+this.escapeHtml(displayName)+',</p><p>A password reset was requested for your Index Assist account.</p><p><a href="'+resetUrl.toString()+'">Reset password</a></p><p>This link expires in 30 minutes. If you did not request it, you can ignore this message.</p>');
 }

 private escapeHtml(value:string):string{
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 }
}
