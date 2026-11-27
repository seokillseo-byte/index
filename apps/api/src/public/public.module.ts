import {Module} from '@nestjs/common';
import {DatabaseModule} from '../database/database.module';
import {PublicCmsController} from './public-cms.controller';
import {PublicAdsController} from './public-ads.controller';
import {PublicPlansController} from './public-plans.controller';
@Module({imports:[DatabaseModule],controllers:[PublicCmsController,PublicAdsController,PublicPlansController]})
export class PublicCmsModule{}
