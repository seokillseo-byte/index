import {Module} from '@nestjs/common';
import {DatabaseModule} from '../database/database.module';
import {PublicCmsController} from './public-cms.controller';
@Module({imports:[DatabaseModule],controllers:[PublicCmsController]})
export class PublicCmsModule{}
