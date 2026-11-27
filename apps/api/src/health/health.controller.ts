import {Controller,Get,ServiceUnavailableException} from '@nestjs/common';
import {ApiOperation,ApiTags} from '@nestjs/swagger';
import {DatabaseService} from '../database/database.module';
@ApiTags('health') @Controller('health')
export class HealthController{
 constructor(private readonly db:DatabaseService){}
 @Get('live') @ApiOperation({summary:'Process liveness probe'}) live(){return {status:'ok'} as const;}
 @Get('ready') @ApiOperation({summary:'Readiness probe with database dependency check'})
 async ready(){try{await this.db.query('SELECT 1');return {status:'ready',checks:{database:'ok'}} as const;}catch{throw new ServiceUnavailableException({status:'not_ready',checks:{database:'unavailable'}});}}
}
