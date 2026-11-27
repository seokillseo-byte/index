import {Body,Controller,Headers,Post,Req} from '@nestjs/common';
import {ApiBearerAuth,ApiOperation,ApiTags} from '@nestjs/swagger';
import {Request} from 'express';
import {IngestUrlsDto} from './ingestion.dto';
import {IngestionService} from './ingestion.service';
@ApiTags('ingestion') @ApiBearerAuth() @Controller('ingestion')
export class IngestionController{
 constructor(private readonly ingestion:IngestionService){}
 @Post('urls') @ApiOperation({summary:'Idempotently ingest up to 5,000 URLs into a tenant project'})
 ingest(@Req() req:Request,@Body() dto:IngestUrlsDto,@Headers('idempotency-key') key?:string){
  return this.ingestion.ingest({userId:req.principal!.userId,tenantId:req.principal!.tenantId},dto,key??'');
 }
}
