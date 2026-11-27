import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {ThrottlerGuard,ThrottlerModule} from '@nestjs/throttler';
import {APP_GUARD} from '@nestjs/core';
import {DatabaseModule} from './database/database.module';
import {AuthModule} from './auth/auth.module';
import {IngestionModule} from './ingestion/ingestion.module';
import {ProjectsModule} from './projects/projects.module';
import {BacklinksModule} from './backlinks/backlinks.module';
import {IntegrationsModule} from './integrations/integrations.module';
import {AdminModule} from './admin/admin.module';
import {HealthController} from './health/health.controller';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,envFilePath:['.env','../../.env']}),ThrottlerModule.forRoot([{name:'default',ttl:60_000,limit:120}]),DatabaseModule,AuthModule,IngestionModule,ProjectsModule,BacklinksModule,IntegrationsModule,AdminModule],controllers:[HealthController],providers:[{provide:APP_GUARD,useClass:ThrottlerGuard}]})
export class AppModule{}
