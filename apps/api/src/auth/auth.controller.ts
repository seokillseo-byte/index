import {Body,Controller,Delete,HttpCode,HttpStatus,Param,Post,Get,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {Throttle} from '@nestjs/throttler';
import {Public} from './auth.constants';
import {AuthService} from './auth.service';
import {LoginDto,MfaDisableDto,MfaLoginDto,MfaRecoveryDto,MfaVerifyDto,PasswordResetDto,PasswordResetRequestDto,RefreshDto,RegisterDto,ResendVerificationDto,VerifyEmailDto} from './auth.dto';

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
 @Public() @Throttle({default:{limit:3,ttl:900_000}}) @Post('password-reset/request') @HttpCode(HttpStatus.OK)
 requestPasswordReset(@Body() dto:PasswordResetRequestDto){return this.auth.requestPasswordReset(dto.email);}
 @Public() @Throttle({default:{limit:5,ttl:900_000}}) @Post('password-reset') @HttpCode(HttpStatus.OK)
 resetPassword(@Body() dto:PasswordResetDto){return this.auth.resetPassword(dto.token,dto.password);}
 @Public() @Throttle({default:{limit:8,ttl:60_000}}) @Post('mfa/login') @HttpCode(HttpStatus.OK)
 completeMfaLogin(@Body() dto:MfaLoginDto){return this.auth.completeMfaLogin(dto.challengeToken,dto.code);}
 @Public() @Throttle({default:{limit:8,ttl:60_000}}) @Post('mfa/recovery') @HttpCode(HttpStatus.OK)
 recoverMfaLogin(@Body() dto:MfaRecoveryDto){return this.auth.recoverMfaLogin(dto.challengeToken,dto.recoveryCode);}
 @Post('mfa/setup') @ApiBearerAuth()
 setupMfa(@Req() req:Request){return this.auth.setupMfa(req.principal!.userId);}
 @Post('mfa/verify') @ApiBearerAuth()
 verifyMfa(@Req() req:Request,@Body() dto:MfaVerifyDto){return this.auth.verifyMfa(req.principal!.userId,dto.code);}
 @Post('mfa/disable') @ApiBearerAuth()
 disableMfa(@Req() req:Request,@Body() dto:MfaDisableDto){return this.auth.disableMfa(req.principal!.userId,dto.password,dto.code);}
 @Public() @Post('refresh') @HttpCode(HttpStatus.OK)
 refresh(@Body() dto:RefreshDto){return this.auth.refresh(dto.refreshToken);}
 @Get('sessions') @ApiBearerAuth()
 listSessions(@Req() req:Request){return this.auth.listSessions(req.principal!.userId);}
 @Delete('sessions/:sessionId') @HttpCode(HttpStatus.OK) @ApiBearerAuth()
 revokeSession(@Req() req:Request,@Param('sessionId') sessionId:string){return this.auth.revokeSession(req.principal!.userId,sessionId);}
 @Post('sessions/revoke-all') @HttpCode(HttpStatus.OK) @ApiBearerAuth()
 revokeAllSessions(@Req() req:Request){return this.auth.revokeAllSessions(req.principal!.userId,req.principal!.sessionId);}
 @Post('logout') @HttpCode(HttpStatus.OK) @ApiBearerAuth()
 logout(@Req() req:Request){return this.auth.logout(req.principal!.userId,req.principal!.sessionId);}
}
