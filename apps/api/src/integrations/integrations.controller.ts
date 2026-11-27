import {Body,Controller,Delete,Get,Param,ParseUUIDPipe,Post,Query,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {Public} from '../auth/auth.constants';
import {ConnectIntegrationDto} from './integrations.dto';
import {IntegrationsService} from './integrations.service';
@ApiTags('search integrations') @Controller('integrations')
export class IntegrationsController{
 constructor(private readonly integrations:IntegrationsService){}
 @Post(':provider/connect') @ApiBearerAuth() @ApiOperation({summary:'Start OAuth connection to Google Search Console or Bing Webmaster'})
 connect(@Req() req:Request,@Param('provider') provider:string,@Body() dto:ConnectIntegrationDto){
  return this.integrations.connect({userId:req.principal!.userId,tenantId:req.principal!.tenantId},dto.projectId,provider);
 }
 @Public() @Get(':provider/callback') @ApiOperation({summary:'OAuth callback for search provider connection'})
 callback(@Param('provider') provider:string,@Query('code') code:string,@Query('state') state:string){
  return this.integrations.callback(provider,code,state);
 }
 @Get() @ApiBearerAuth() @ApiOperation({summary:'List search provider connections in the active workspace'})
 list(@Req() req:Request){return this.integrations.list({userId:req.principal!.userId,tenantId:req.principal!.tenantId});}
 @Delete(':id') @ApiBearerAuth() @ApiOperation({summary:'Revoke and delete stored provider credentials'})
 disconnect(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string){
  return this.integrations.disconnect({userId:req.principal!.userId,tenantId:req.principal!.tenantId},id);
 }
}
