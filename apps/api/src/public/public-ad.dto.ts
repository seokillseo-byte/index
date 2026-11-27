import {IsEmail,IsIn,IsOptional,IsString,IsUrl,IsInt,Min,Max,Length,MaxLength,IsUUID} from 'class-validator';
export class PublicAdEventDto {
 @IsUUID() campaignId!:string;
 @IsUUID() creativeId!:string;
 @IsUUID() slotId!:string;
 @IsIn(['impression','click']) eventType!:string;
 @IsIn(['contextual_only','analytics','marketing']) consentState!:string;
}
export class AdvertiserInquiryDto {
 @IsString() @Length(2,160) companyName!:string;
 @IsString() @Length(2,120) contactName!:string;
 @IsEmail() @MaxLength(254) email!:string;
 @IsOptional() @IsUrl({protocols:['http','https'],require_protocol:true}) websiteUrl?:string;
 @IsOptional() @IsInt() @Min(0) @Max(100000000000) requestedBudgetMinor?:number;
 @IsOptional() @IsString() @MaxLength(4000) message?:string;
}
