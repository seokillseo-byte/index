import {Controller,Get,Param,ParseIntPipe,ParseUUIDPipe,Query,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {BacklinksService} from './backlinks.service';
@ApiTags('backlinks') @ApiBearerAuth() @Controller('projects/:projectId/backlinks')
export class BacklinksController{
 constructor(private readonly backlinks:BacklinksService){}
 @Get() @ApiOperation({summary:'List discovered backlinks for a project'})
 list(@Req() req:Request,@Param('projectId',new ParseUUIDPipe()) projectId:string,@Query('page',new ParseIntPipe({optional:true})) page=1,@Query('limit',new ParseIntPipe({optional:true})) limit=50){
  return this.backlinks.list({userId:req.principal!.userId,tenantId:req.principal!.tenantId},projectId,Math.max(1,page),Math.min(100,Math.max(1,limit)));
 }
}
