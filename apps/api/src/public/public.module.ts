import {Module} from '@nestjs/common';
import {DatabaseModule} from '../database/database.module';
import {PublicCmsController} from './public-cms.controller';
import {PublicAdsController} from './public-ads.controller';
@Module({imports:[DatabaseModule],controllers:[PublicCmsController,PublicAdsController]})
export class PublicCmsModule{}
