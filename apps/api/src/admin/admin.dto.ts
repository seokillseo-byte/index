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

export class CreateAdvertiserDto {
 @IsString() @Length(2,160) companyName!:string;
 @IsEmail() @MaxLength(254) contactEmail!:string;
}
export class CreateCampaignDto {
 @IsUUID() advertiserId!:string;
 @IsString() @Length(2,160) name!:string;
 @IsUrl({protocols:['http','https'],require_protocol:true}) destinationUrl!:string;
 @IsInt() @Min(0) budgetMinor!:number;
 @IsString() @Length(3,3) currency!:string;
 @IsOptional() @IsString() startsAt?:string;
 @IsOptional() @IsString() endsAt?:string;
}
export class CreateCreativeDto {
 @IsUUID() campaignId!:string;
 @IsUUID() slotId!:string;
 @IsString() @Length(2,180) headline!:string;
 @IsString() @Length(4,1000) assetKey!:string;
 @IsOptional() @IsString() @MaxLength(300) altText?:string;
 @IsString() @Length(2,80) disclosureLabel!:string;
}
export class UpdateCreativeStatusDto { @IsIn(['approved','rejected','disabled']) status!:string; }
export class CreateAdSlotDto {
 @IsString() @Length(2,80) @Matches(/^[a-z0-9-]+$/) code!:string;
 @IsString() @Length(2,120) name!:string;
 @IsIn(['public','dashboard']) surface!:string;
 @IsString() @Length(2,120) placement!:string;
 @IsOptional() @IsBoolean() enabled?:boolean;
 @IsOptional() @IsObject() policyConfig?:Record<string,unknown>;
}
