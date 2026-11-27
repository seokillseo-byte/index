import {Body,Controller,HttpCode,HttpStatus,Post,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {Public} from './auth.constants';
import {AuthService} from './auth.service';
import {LoginDto,RefreshDto,RegisterDto} from './auth.dto';
@ApiTags('authentication')
@Controller('auth')
export class AuthController{
 constructor(private readonly auth:AuthService){}
 @Public() @Post('register') @ApiOperation({summary:'Create a user and isolated workspace'})
 register(@Body() dto:RegisterDto){return this.auth.register(dto);}
 @Public() @Post('login') @HttpCode(HttpStatus.OK)
 login(@Body() dto:LoginDto){return this.auth.login(dto);}
 @Public() @Post('refresh') @HttpCode(HttpStatus.OK)
 refresh(@Body() dto:RefreshDto){return this.auth.refresh(dto.refreshToken);}
 @Post('logout') @HttpCode(HttpStatus.OK) @ApiBearerAuth()
 logout(@Req() req:Request){return this.auth.logout(req.principal!.userId,req.principal!.sessionId);}
}
