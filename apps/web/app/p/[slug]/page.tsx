import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {cmsApi} from '../../../lib/public-api';
import {PublicSiteShell} from '../../public-site-shell';
type Props={params:Promise<{slug:string}>};
async function getPage(slug:string){return cmsApi('pages/'+encodeURIComponent(slug));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params,p=await getPage(slug);if(!p)return {title:'Không tìm thấy trang',robots:{index:false,follow:false}};return {title:p.seo_title||p.title,description:p.meta_description,alternates:p.canonical_url?{canonical:p.canonical_url}:undefined,robots:{index:p.robots_index!==false,follow:p.robots_follow!==false}};}
export default async function CmsPage({params}:Props){const {slug}=await params,p=await getPage(slug);if(!p)notFound();const body=typeof p.body?.markdown==='string'?p.body.markdown:JSON.stringify(p.body);return <PublicSiteShell><article className="prose"><div className="eyebrow">INDEX ASSIST</div><h1 className="page-title">{p.title}</h1><p>{body}</p></article></PublicSiteShell>;}
