import {Module} from '@nestjs/common';
import {ConfigModule,ConfigService} from '@nestjs/config';
import {ThrottlerGuard,ThrottlerModule} from '@nestjs/throttler';
import {APP_GUARD} from '@nestjs/core';
import {DatabaseModule} from './database/database.module';
import {AuthModule} from './auth/auth.module';
import {IngestionModule} from './ingestion/ingestion.module';
import {ProjectsModule} from './projects/projects.module';
import {BacklinksModule} from './backlinks/backlinks.module';
import {IntegrationsModule} from './integrations/integrations.module';
import {HealthController} from './health/health.controller';
import {RedisThrottlerStorage} from './throttling/redis-throttler.storage';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,envFilePath:['.env','../../.env']}),ThrottlerModule.forRootAsync({inject:[ConfigService],useFactory:(config:ConfigService)=>({throttlers:[{name:'default',ttl:60_000,limit:120}],storage:new RedisThrottlerStorage(config.get<string>('REDIS_URL')??'')})}),DatabaseModule,AuthModule,IngestionModule,ProjectsModule,BacklinksModule,IntegrationsModule],controllers:[HealthController],providers:[{provide:APP_GUARD,useClass:ThrottlerGuard}]})
export class AppModule{}
