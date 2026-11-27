import {Body,Controller,Get,Param,ParseIntPipe,ParseUUIDPipe,Patch,Post,Query,Req,UseGuards} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {AdminService} from './admin.service';
import {CreateAdSlotDto,CreateAdvertiserDto,CreateCampaignDto,CreateCreativeDto,SaveCmsDto,UpdateAdSlotDto,UpdateAdvertiserStatusDto,UpdateCampaignStatusDto,UpdateCreativeStatusDto,UpdateInquiryStatusDto,UpdateOrderStatusDto,UpdateTenantStatusDto} from './admin.dto';
import {PlatformAdminGuard,PlatformRoles} from './platform-admin.guard';

@ApiTags('Platform administration')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(PlatformAdminGuard)
export class AdminController{
 constructor(private readonly admin:AdminService){}
 private actor(req:Request){return req.principal!.userId;}
 private ip(req:Request){return req.ip;}
 @Get('overview') @PlatformRoles('super_admin','admin','support') @ApiOperation({summary:'Platform-wide SaaS, ingestion, orders, CMS and ad overview'})
 overview(@Req() req:Request){return this.admin.overview(this.actor(req));}
 @Get('customers') @PlatformRoles('super_admin','admin','support') customers(@Req() req:Request,@Query('page',new ParseIntPipe({optional:true})) page=1,@Query('limit',new ParseIntPipe({optional:true})) limit=50,@Query('search') search?:string,@Query('status') status?:string){
  return this.admin.customers(this.actor(req),Math.max(1,page),Math.min(100,Math.max(1,limit)),search,status);
 }
 @Get('customers/:tenantId') @PlatformRoles('super_admin','admin','support') customer(@Req() req:Request,@Param('tenantId',new ParseUUIDPipe()) tenantId:string){return this.admin.customerDetail(this.actor(req),tenantId);}
 @Patch('customers/:tenantId/status') @PlatformRoles('super_admin','admin') updateCustomer(@Req() req:Request,@Param('tenantId',new ParseUUIDPipe()) tenantId:string,@Body() dto:UpdateTenantStatusDto){return this.admin.updateTenantStatus(this.actor(req),tenantId,dto.status,this.ip(req));}
 @Get('orders') @PlatformRoles('super_admin','admin','support') orders(@Req() req:Request,@Query('page',new ParseIntPipe({optional:true})) page=1,@Query('limit',new ParseIntPipe({optional:true})) limit=50,@Query('status') status?:string){return this.admin.orders(this.actor(req),Math.max(1,page),Math.min(100,Math.max(1,limit)),status);}
 @Patch('orders/:id/status') @PlatformRoles('super_admin','admin') updateOrder(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateOrderStatusDto){return this.admin.updateOrderStatus(this.actor(req),id,dto.status,this.ip(req));}
 @Get('cms/pages') @PlatformRoles('super_admin','admin','content_editor') pages(@Req() req:Request){return this.admin.cmsList(this.actor(req),'page');}
 @Post('cms/pages') @PlatformRoles('super_admin','admin','content_editor') savePage(@Req() req:Request,@Body() dto:SaveCmsDto){return this.admin.saveCms(this.actor(req),'page',dto,this.ip(req));}
 @Get('cms/posts') @PlatformRoles('super_admin','admin','content_editor') posts(@Req() req:Request){return this.admin.cmsList(this.actor(req),'post');}
 @Post('cms/posts') @PlatformRoles('super_admin','admin','content_editor') savePost(@Req() req:Request,@Body() dto:SaveCmsDto){return this.admin.saveCms(this.actor(req),'post',dto,this.ip(req));}

 @Get('ads/advertisers') @PlatformRoles('super_admin','admin','ad_manager') advertisers(@Req() req:Request){return this.admin.advertisers(this.actor(req));}
 @Post('ads/advertisers') @PlatformRoles('super_admin','admin','ad_manager') createAdvertiser(@Req() req:Request,@Body() dto:CreateAdvertiserDto){return this.admin.createAdvertiser(this.actor(req),dto,this.ip(req));}
 @Patch('ads/advertisers/:id/status') @PlatformRoles('super_admin','admin','ad_manager') updateAdvertiser(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateAdvertiserStatusDto){return this.admin.updateAdvertiserStatus(this.actor(req),id,dto.status,this.ip(req));}
 @Post('ads/inquiries/:id/convert') @PlatformRoles('super_admin','admin','ad_manager') convertInquiry(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string){return this.admin.convertInquiry(this.actor(req),id,this.ip(req));}
 @Post('ads/campaigns') @PlatformRoles('super_admin','admin','ad_manager') createCampaign(@Req() req:Request,@Body() dto:CreateCampaignDto){return this.admin.createCampaign(this.actor(req),dto,this.ip(req));}
 @Get('ads/creatives') @PlatformRoles('super_admin','admin','ad_manager') creatives(@Req() req:Request){return this.admin.creatives(this.actor(req));}
 @Post('ads/creatives') @PlatformRoles('super_admin','admin','ad_manager') createCreative(@Req() req:Request,@Body() dto:CreateCreativeDto){return this.admin.createCreative(this.actor(req),dto,this.ip(req));}
 @Patch('ads/creatives/:id/status') @PlatformRoles('super_admin','admin','ad_manager') updateCreative(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateCreativeStatusDto){return this.admin.updateCreativeStatus(this.actor(req),id,dto.status,this.ip(req));}
 @Post('ads/slots') @PlatformRoles('super_admin','admin','ad_manager') createSlot(@Req() req:Request,@Body() dto:CreateAdSlotDto){return this.admin.createAdSlot(this.actor(req),dto,this.ip(req));}
 @Get('ads/campaigns') @PlatformRoles('super_admin','admin','ad_manager') campaigns(@Req() req:Request){return this.admin.campaigns(this.actor(req));}
 @Patch('ads/campaigns/:id/status') @PlatformRoles('super_admin','admin','ad_manager') updateCampaign(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateCampaignStatusDto){return this.admin.updateCampaignStatus(this.actor(req),id,dto.status,this.ip(req));}
 @Get('ads/inquiries') @PlatformRoles('super_admin','admin','ad_manager') inquiries(@Req() req:Request){return this.admin.inquiries(this.actor(req));}
 @Patch('ads/inquiries/:id/status') @PlatformRoles('super_admin','admin','ad_manager') updateInquiry(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateInquiryStatusDto){return this.admin.updateInquiry(this.actor(req),id,dto.status,this.ip(req));}
 @Get('ads/slots') @PlatformRoles('super_admin','admin','ad_manager') slots(@Req() req:Request){return this.admin.adSlots(this.actor(req));}
 @Patch('ads/slots/:id') @PlatformRoles('super_admin','admin','ad_manager') updateSlot(@Req() req:Request,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:UpdateAdSlotDto){return this.admin.updateAdSlot(this.actor(req),id,dto,this.ip(req));}
 @Get('audit') @PlatformRoles('super_admin','admin') audit(@Req() req:Request,@Query('page',new ParseIntPipe({optional:true})) page=1,@Query('limit',new ParseIntPipe({optional:true})) limit=50){return this.admin.auditLogs(this.actor(req),Math.max(1,page),Math.min(100,Math.max(1,limit)));}
}
