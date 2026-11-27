import {Controller,Get,NotFoundException,Param,Query} from '@nestjs/common';
import {ApiOperation,ApiTags} from '@nestjs/swagger';
import {DatabaseService} from '../database/database.module';
import {Public} from '../auth/auth.constants';

@ApiTags('Public content')
@Controller('public/cms')
export class PublicCmsController{
 constructor(private readonly db:DatabaseService){}
 @Get('pages') @Public() @ApiOperation({summary:'List published CMS pages'})
 async pages(){
  return (await this.db.query("SELECT p.id,p.slug,p.title,p.published_at,s.seo_title,s.meta_description FROM app.cms_pages p LEFT JOIN app.seo_metadata s ON s.entity_type='page' AND s.entity_id=p.id WHERE p.status='published' AND p.published_at<=now() ORDER BY p.published_at DESC")).rows;
 }
 @Get('pages/:slug') @Public() @ApiOperation({summary:'Read a published CMS page'})
 async page(@Param('slug') slug:string){
  const r=await this.db.query("SELECT p.id,p.slug,p.title,p.body,p.published_at,s.seo_title,s.meta_description,s.canonical_url,s.robots_index,s.robots_follow FROM app.cms_pages p LEFT JOIN app.seo_metadata s ON s.entity_type='page' AND s.entity_id=p.id WHERE p.slug=$1 AND p.status='published' AND p.published_at<=now() LIMIT 1",[slug]);
  if(!r.rowCount)throw new NotFoundException('Page not found');return r.rows[0];
 }
 @Get('posts') @Public() @ApiOperation({summary:'List published blog posts'})
 async posts(@Query('page') page='1',@Query('limit') limit='20'){
  const p=Math.max(1,Math.min(1000,Number(page)||1)),l=Math.max(1,Math.min(50,Number(limit)||20)),offset=(p-1)*l;
  const r=await this.db.query("SELECT p.id,p.slug,p.title,p.excerpt,p.published_at,p.featured_image_key,s.seo_title,s.meta_description,COALESCE((SELECT jsonb_agg(jsonb_build_object('name',c.name,'slug',c.slug)) FROM app.cms_post_categories pc JOIN app.cms_categories c ON c.id=pc.category_id WHERE pc.post_id=p.id),'[]'::jsonb) categories FROM app.cms_posts p LEFT JOIN app.seo_metadata s ON s.entity_type='post' AND s.entity_id=p.id WHERE p.status='published' AND p.published_at<=now() ORDER BY p.published_at DESC LIMIT $1 OFFSET $2",[l,offset]);
  return {page:p,limit:l,items:r.rows};
 }
 @Get('posts/:slug') @Public() @ApiOperation({summary:'Read a published blog post'})
 async post(@Param('slug') slug:string){
  const r=await this.db.query("SELECT p.id,p.slug,p.title,p.excerpt,p.body,p.published_at,p.featured_image_key,s.seo_title,s.meta_description,s.canonical_url,s.robots_index,s.robots_follow,COALESCE((SELECT jsonb_agg(jsonb_build_object('name',c.name,'slug',c.slug)) FROM app.cms_post_categories pc JOIN app.cms_categories c ON c.id=pc.category_id WHERE pc.post_id=p.id),'[]'::jsonb) categories FROM app.cms_posts p LEFT JOIN app.seo_metadata s ON s.entity_type='post' AND s.entity_id=p.id WHERE p.slug=$1 AND p.status='published' AND p.published_at<=now() LIMIT 1",[slug]);
  if(!r.rowCount)throw new NotFoundException('Post not found');return r.rows[0];
 }
}
