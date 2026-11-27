import {Controller,Get,Query,Req,ParseIntPipe} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {BillingService} from './billing.service';
@ApiTags('billing') @ApiBearerAuth() @Controller('billing')
export class BillingController{
 constructor(private readonly billing:BillingService){}
 @Get('summary') @ApiOperation({summary:'Read current subscription and workspace usage'})
 summary(@Req() req:Request){return this.billing.summary({userId:req.principal!.userId,tenantId:req.principal!.tenantId});}
 @Get('plans') @ApiOperation({summary:'List active SaaS plans'})
 plans(@Req() req:Request){return this.billing.plans({userId:req.principal!.userId,tenantId:req.principal!.tenantId});}
 @Get('orders') @ApiOperation({summary:'List workspace billing orders'})
 orders(@Req() req:Request,@Query('page',new ParseIntPipe({optional:true})) page=1,@Query('limit',new ParseIntPipe({optional:true})) limit=50){return this.billing.orders({userId:req.principal!.userId,tenantId:req.principal!.tenantId},Math.max(1,page),Math.min(100,Math.max(1,limit)));}
}
