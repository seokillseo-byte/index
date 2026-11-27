import {ArrayMaxSize,ArrayMinSize,IsArray,IsInt,IsString,IsUUID,Length,Max,Min} from 'class-validator';
export class IngestUrlsDto{
 @IsUUID() projectId!:string;
 @IsInt() @Min(1) @Max(100) tier!:number;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5000) @IsString({each:true}) @Length(1,4096,{each:true}) urls!:string[];
}
