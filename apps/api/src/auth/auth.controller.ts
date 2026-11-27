import {Body,Controller,HttpCode,HttpStatus,Post,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {Throttle} from '@nestjs/throttler';
import {Public} from './auth.constants';
import {AuthService} from './auth.service';
import {LoginDto,RefreshDto,RegisterDto,ResendVerificationDto,VerifyEmailDto} from './auth.dto';
@ApiTags('authentication')
@Controller('auth')
export class AuthController{
 constructor(private readonly auth:AuthService){}
 @Public() @Throttle({default:{limit:5,ttl:60_000}}) @Post('register') @ApiOperation({summary:'Create a user and isolated workspace; email verification is required before login'})
 register(@Body() dto:RegisterDto){return this.auth.register(dto);}
 @Public() @Throttle({default:{limit:8,ttl:60_000}}) @Post('login') @HttpCode(HttpStatus.OK)
 login(@Body() dto:LoginDto){return this.auth.login(dto);}
 @Public() @Throttle({default:{limit:5,ttl:60_000}}) @Post('verify-email') @HttpCode(HttpStatus.OK)
 verifyEmail(@Body() dto:VerifyEmailDto){return this.auth.verifyEmail(dto.token);}
 @Public() @Throttle({default:{limit:3,ttl:900_000}}) @Post('resend-verification') @HttpCode(HttpStatus.OK)
 resendVerification(@Body() dto:ResendVerificationDto){return this.auth.resendVerification(dto.email);}
 @Public() @Post('refresh') @HttpCode(HttpStatus.OK)
 refresh(@Body() dto:RefreshDto){return this.auth.refresh(dto.refreshToken);}
 @Post('logout') @HttpCode(HttpStatus.OK) @ApiBearerAuth()
 logout(@Req() req:Request){return this.auth.logout(req.principal!.userId,req.principal!.sessionId);}
}
