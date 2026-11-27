import {IsIn,IsUUID} from 'class-validator';
export class PublicAdEventDto {
 @IsUUID() campaignId!:string;
 @IsUUID() creativeId!:string;
 @IsUUID() slotId!:string;
 @IsIn(['impression','click']) eventType!:string;
 @IsIn(['contextual_only','analytics','marketing']) consentState!:string;
}
