import {Module} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {RedisThrottlerStorage} from './redis-throttler.storage';

@Module({
  providers:[{
    provide:RedisThrottlerStorage,
    inject:[ConfigService],
    useFactory:(config:ConfigService)=>new RedisThrottlerStorage(config.get<string>('REDIS_URL')??''),
  }],
  exports:[RedisThrottlerStorage],
})
export class RedisThrottlerStorageModule {}
