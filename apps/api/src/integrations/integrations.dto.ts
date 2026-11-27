import {IsString,IsUUID,Length} from 'class-validator';
export class ConnectIntegrationDto { @IsUUID() projectId!:string; }

export class AttachIntegrationSiteDto {
 @IsUUID() projectId!:string;
 @IsString() @Length(3,2048) siteUrl!:string;
}
export class BingApiKeyDto {
 @IsUUID() projectId!:string;
 @IsString() @Length(20,512) apiKey!:string;
}

import {ArrayMaxSize,ArrayMinSize,ArrayUnique,IsArray,IsString,IsUrl,IsUUID,Length} from 'class-validator';
export class QueueProviderUrlsDto {
 @IsUUID() projectId!:string;
 @IsString() @Length(3,2048) siteUrl!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsUrl({protocols:['http','https'],require_protocol:true},{each:true}) urls!:string[];
}
