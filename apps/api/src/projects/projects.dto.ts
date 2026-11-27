import {IsOptional,IsString,Length,MaxLength,IsUrl} from 'class-validator';
export class CreateProjectDto {
 @IsString() @Length(2,100) name!:string;
 @IsOptional() @IsString() @MaxLength(2048) @IsUrl({protocols:['http','https'],require_protocol:true}) targetUrl?:string;
}
export class UpdateProjectDto {
 @IsOptional() @IsString() @Length(2,100) name?:string;
 @IsOptional() @IsString() @MaxLength(2048) @IsUrl({protocols:['http','https'],require_protocol:true}) targetUrl?:string;
}
