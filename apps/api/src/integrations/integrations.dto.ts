import {IsUUID} from 'class-validator';
export class ConnectIntegrationDto { @IsUUID() projectId!:string; }

export class AttachIntegrationSiteDto {
 @IsUUID() projectId!:string;
 @IsString() @Length(3,2048) siteUrl!:string;
}
export class BingApiKeyDto {
 @IsUUID() projectId!:string;
 @IsString() @Length(20,512) apiKey!:string;
}
