import {Body,Controller,Get,NotFoundException,Param,Post} from '@nestjs/common';
import {ApiOperation,ApiTags} from '@nestjs/swagger';
import {DatabaseService} from '../database/database.module';
import {Public} from '../auth/auth.constants';
import {AdvertiserInquiryDto,PublicAdEventDto} from './public-ad.dto';
@ApiTags('Public advertising')
@Controller('public/ads')
export class PublicAdsController{
 constructor(private readonly db:DatabaseService){}
 @Get('slots/:code') @Public() @ApiOperation({summary:'Serve one active approved contextual advertisement'})
 async slot(@Param('code') code:string){
  const r=await this.db.query("SELECT s.code slot_code,c.id campaign_id,cr.id creative_id,s.id slot_id,cr.headline,cr.asset_key,cr.alt_text,cr.disclosure_label,c.destination_url FROM app.ad_slots s JOIN app.ad_creatives cr ON cr.slot_id=s.id JOIN app.ad_campaigns c ON c.id=cr.campaign_id WHERE s.code=$1 AND s.surface='public' AND s.enabled=true AND cr.status='approved' AND c.status='active' AND (c.starts_at IS NULL OR c.starts_at<=now()) AND (c.ends_at IS NULL OR c.ends_at>now()) ORDER BY c.created_at DESC LIMIT 1",[code]);
  if(!r.rowCount)throw new NotFoundException('No advertisement is available for this placement');return r.rows[0];
 }
 @Post('advertiser-inquiries') @Public() @ApiOperation({summary:'Submit a request to advertise on Index Assist'})
 async inquiry(@Body() dto:AdvertiserInquiryDto){
  const r=await this.db.query("INSERT INTO app.advertiser_inquiries(company_name,contact_name,email,website_url,requested_budget_minor,message,status) VALUES($1,$2,$3,$4,$5,$6,'new') RETURNING id,created_at",[dto.companyName,dto.contactName,dto.email,dto.websiteUrl||null,dto.requestedBudgetMinor??null,dto.message||null]);
  return {received:true,inquiryId:r.rows[0].id,createdAt:r.rows[0].created_at};
 }

 @Post('events') @Public() @ApiOperation({summary:'Record a contextual ad impression or click'})
 async event(@Body() dto:PublicAdEventDto){
  const r=await this.db.query("INSERT INTO app.ad_events(campaign_id,creative_id,slot_id,event_type,consent_state) VALUES($1,$2,$3,$4,$5) RETURNING id,occurred_at",[dto.campaignId,dto.creativeId,dto.slotId,dto.eventType,dto.consentState]);
  return {recorded:true,eventId:r.rows[0].id,occurredAt:r.rows[0].occurred_at};
 }
}
