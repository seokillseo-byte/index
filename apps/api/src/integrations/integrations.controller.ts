import {Body,Controller,Delete,Get,Param,ParseUUIDPipe,Post,Query,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {Public} from '../auth/auth.constants';
import {AttachIntegrationSiteDto,BingApiKeyDto,ConnectIntegrationDto} from './integrations.dto';
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
 @Get(':id/sites') @ApiBearerAuth() @ApiOperation({summary:'List provider sites available to the connected account'})
 sites(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string){return this.integrations.listSites({userId:req.principal!.userId,tenantId:req.principal!.tenantId},id);}
 @Post(':id/sites') @ApiBearerAuth() @ApiOperation({summary:'Bind a verified provider property to a project'})
 attachSite(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AttachIntegrationSiteDto){return this.integrations.attachSite({userId:req.principal!.userId,tenantId:req.principal!.tenantId},id,dto.projectId,dto.siteUrl);}
 @Post('bing_webmaster/api-key') @ApiBearerAuth() @ApiOperation({summary:'Connect Bing Webmaster with an account API key fallback'})
 bingApiKey(@Req() req:Request,@Body() dto:BingApiKeyDto){return this.integrations.createBingApiKey({userId:req.principal!.userId,tenantId:req.principal!.tenantId},dto.projectId,dto.apiKey);}
 @Get() @ApiBearerAuth() @ApiOperation({summary:'List search provider connections in the active workspace'})
 list(@Req() req:Request){return this.integrations.list({userId:req.principal!.userId,tenantId:req.principal!.tenantId});}
 @Delete(':id') @ApiBearerAuth() @ApiOperation({summary:'Revoke and delete stored provider credentials'})
 disconnect(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string){
  return this.integrations.disconnect({userId:req.principal!.userId,tenantId:req.principal!.tenantId},id);
 }
}
