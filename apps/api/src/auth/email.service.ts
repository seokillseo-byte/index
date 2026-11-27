import {Injectable,ServiceUnavailableException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';

@Injectable()
export class EmailService{
 constructor(private readonly config:ConfigService){}

 async sendVerificationEmail(to:string,displayName:string,token:string):Promise<void>{
  const apiKey=this.config.get<string>('RESEND_API_KEY');
  const from=this.config.get<string>('EMAIL_FROM');
  const baseUrl=this.config.get<string>('APP_BASE_URL');
  if(!apiKey||!from||!baseUrl)throw new ServiceUnavailableException('Transactional email is not configured');
  const verificationUrl=new URL('/verify-email',baseUrl);
  verificationUrl.searchParams.set('token',token);
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{'content-type':'application/json',authorization:'Bearer '+apiKey},
   body:JSON.stringify({
    from,
    to:[to],
    subject:'Verify your Index Assist email address',
    html:'<p>Hello '+this.escapeHtml(displayName)+',</p><p>Verify your Index Assist email address to activate your account.</p><p><a href="'+verificationUrl.toString()+'">Verify email address</a></p><p>This link expires in 30 minutes.</p>',
   }),
   signal:AbortSignal.timeout(15_000),
  });
  if(!response.ok)throw new ServiceUnavailableException('Transactional email provider rejected the verification email');
 }

 private escapeHtml(value:string):string{
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 }
}
