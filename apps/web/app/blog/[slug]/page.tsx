import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {cmsApi} from '../../../lib/public-api';
import {PublicSiteShell} from '../../public-site-shell';
import {PublicAdSlot} from '../../public-ad-slot';
type Props={params:Promise<{slug:string}>};
async function getPost(slug:string){return cmsApi('posts/'+encodeURIComponent(slug));}
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params,p=await getPost(slug);if(!p)return {title:'Không tìm thấy bài viết',robots:{index:false,follow:false}};return {title:p.seo_title||p.title,description:p.meta_description||p.excerpt,alternates:p.canonical_url?{canonical:p.canonical_url}:undefined,robots:{index:p.robots_index!==false,follow:p.robots_follow!==false}};}
export default async function BlogPost({params}:Props){const {slug}=await params,p=await getPost(slug);if(!p)notFound();const body=typeof p.body?.markdown==='string'?p.body.markdown:JSON.stringify(p.body);return <PublicSiteShell><article className="prose"><div className="eyebrow">BLOG / SEO</div><h1 className="page-title">{p.title}</h1><div className="meta">{p.published_at?new Date(p.published_at).toLocaleDateString('vi-VN'):''}</div>{p.excerpt&&<p className="section-intro">{p.excerpt}</p>}<PublicAdSlot code="blog-top"/><div className="prose"><p>{body}</p></div></article></PublicSiteShell>;}
