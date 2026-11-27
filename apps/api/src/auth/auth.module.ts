import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {ConfigService} from '@nestjs/config';
import {APP_GUARD} from '@nestjs/core';
import {DatabaseModule} from '../database/database.module';
import {AuthController} from './auth.controller';
import {AuthService} from './auth.service';
import {EmailService} from './email.service';
import {JwtAuthGuard} from './jwt-auth.guard';
import {TenantContextGuard} from '../tenancy/tenant-context.guard';
@Module({
 imports:[DatabaseModule,JwtModule.registerAsync({inject:[ConfigService],useFactory:(config:ConfigService)=>{
  const secret=config.get<string>('JWT_ACCESS_SECRET');
  if(!secret||secret.length<48)throw new Error('JWT_ACCESS_SECRET must contain at least 48 characters');
  return {secret,signOptions:{expiresIn:Number(config.get<string>('ACCESS_TOKEN_TTL_SECONDS')??900),issuer:'index-assist',audience:'index-assist-api'},verifyOptions:{issuer:'index-assist',audience:'index-assist-api'}};
 }})],
 controllers:[AuthController],providers:[AuthService,EmailService,JwtAuthGuard,TenantContextGuard,
 {provide:APP_GUARD,useClass:JwtAuthGuard},{provide:APP_GUARD,useClass:TenantContextGuard}],exports:[AuthService]
})
export class AuthModule{}
