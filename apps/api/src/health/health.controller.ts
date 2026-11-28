import {Controller,Get,ServiceUnavailableException} from '@nestjs/common';
import {ApiOperation,ApiTags} from '@nestjs/swagger';
import {DatabaseService} from '../database/database.module';
import {RedisThrottlerStorage} from '../throttling/redis-throttler.storage';
import {Public} from '../auth/auth.constants';
@Public() @ApiTags('health') @Controller('health')
export class HealthController{
 constructor(private readonly db:DatabaseService,private readonly throttling:RedisThrottlerStorage){}
 @Get('live') @ApiOperation({summary:'Process liveness probe'}) live(){return {status:'ok'} as const;}
 @Get('ready') @ApiOperation({summary:'Readiness probe with database dependency check'})
 async ready(){
  let database='ok',redis='ok';
  try{await this.db.query('SELECT 1');}catch{database='unavailable';}
  try{await this.throttling.checkHealth();}catch{redis='unavailable';}
  if(database!=='ok'||redis!=='ok')throw new ServiceUnavailableException({status:'not_ready',checks:{database,redis}});
  return {status:'ready',checks:{database,redis}} as const;
 }
}
