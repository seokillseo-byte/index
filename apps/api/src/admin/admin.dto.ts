import {IsBoolean,IsIn,IsObject,IsOptional,IsString,IsUrl,IsUUID,Length,MaxLength,Matches} from 'class-validator';
export class UpdateTenantStatusDto { @IsIn(['active','suspended','closed']) status!:string; }
export class UpdateOrderStatusDto { @IsIn(['cancelled','rejected','fulfilled']) status!:string; }
export class SaveCmsDto {
 @IsOptional() @IsUUID() id?:string;
 @IsString() @Length(2,160) title!:string;
 @IsString() @Length(2,180) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug!:string;
 @IsObject() body!:Record<string,unknown>;
 @IsOptional() @IsString() @MaxLength(500) excerpt?:string;
 @IsOptional() @IsIn(['draft','in_review','scheduled','published','archived']) status?:string;
 @IsOptional() @IsString() @MaxLength(70) seoTitle?:string;
 @IsOptional() @IsString() @MaxLength(170) metaDescription?:string;
 @IsOptional() @IsUrl({protocols:['http','https'],require_protocol:true}) canonicalUrl?:string;
}
export class UpdateCampaignStatusDto { @IsIn(['approved','rejected','paused','active']) status!:string; }
export class UpdateInquiryStatusDto { @IsIn(['contacted','qualified','rejected','converted']) status!:string; }
export class UpdateAdSlotDto { @IsOptional() @IsBoolean() enabled?:boolean; @IsOptional() @IsString() @MaxLength(120) name?:string; @IsOptional() @IsString() @MaxLength(120) placement?:string; }
