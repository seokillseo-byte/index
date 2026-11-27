import {Module} from '@nestjs/common';
import {BacklinksController} from './backlinks.controller';
import {BacklinksService} from './backlinks.service';
@Module({controllers:[BacklinksController],providers:[BacklinksService]})
export class BacklinksModule{}
