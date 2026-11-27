import type {MetadataRoute} from 'next';
import {cmsApi} from '../lib/public-api';
const origin='https://index-assist.io.vn';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const [posts,pages]=await Promise.all([cmsApi('posts?page=1&limit=50'),cmsApi('pages')]);
 const fixed=['','features','pricing','blog','advertise','contact','terms','privacy'].map(path=>({url:origin+(path?'/'+path:''),lastModified:new Date()}));
 const postItems=(posts?.items||[]).map((p:any)=>({url:origin+'/blog/'+p.slug,lastModified:p.published_at?new Date(p.published_at):new Date()}));
 const pageItems=(pages||[]).map((p:any)=>({url:origin+'/p/'+p.slug,lastModified:p.published_at?new Date(p.published_at):new Date()}));
 return [...fixed,...postItems,...pageItems];
}
