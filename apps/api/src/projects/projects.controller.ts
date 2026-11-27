import {Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {CreateProjectDto,UpdateProjectDto} from './projects.dto';
import {ProjectsService} from './projects.service';
@ApiTags('projects') @ApiBearerAuth() @Controller('projects')
export class ProjectsController{
 constructor(private readonly projects:ProjectsService){}
 @Get() @ApiOperation({summary:'List projects in the authenticated workspace'})
 list(@Req() req:Request){return this.projects.list({userId:req.principal!.userId,tenantId:req.principal!.tenantId});}
 @Post() @ApiOperation({summary:'Create a project within the active plan limit'})
 create(@Req() req:Request,@Body() dto:CreateProjectDto){return this.projects.create({userId:req.principal!.userId,tenantId:req.principal!.tenantId},dto);}
 @Patch(':id') @ApiOperation({summary:'Update project name or destination target URL'})
 update(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateProjectDto){return this.projects.update({userId:req.principal!.userId,tenantId:req.principal!.tenantId},id,dto);}
}
