import {Controller,Get} from '@nestjs/common';
import {ApiOperation,ApiTags} from '@nestjs/swagger';
import {Public} from '../auth/auth.constants';
import {DatabaseService} from '../database/database.module';
@ApiTags('Public plans') @Controller('public')
export class PublicPlansController{
 constructor(private readonly db:DatabaseService){}
 @Get('plans') @Public() @ApiOperation({summary:'List active SaaS plans for the public pricing page'})
 async plans(){return (await this.db.query("SELECT code,name,monthly_price_minor,currency,daily_url_quota,max_projects,features FROM app.plans WHERE is_active=true ORDER BY monthly_price_minor ASC")).rows;}
}
