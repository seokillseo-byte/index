'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {AdminShell} from './admin-shell';
type Overview=Record<string,number>;
const cards:[string,string][]=[['active_tenants','Workspace hoạt động'],['active_users','Người dùng'],['projects','Projects'],['urls_total','Tổng URL'],['url_tasks_active','URL đang xử lý'],['provider_jobs_active','Provider jobs'],['pending_orders','Đơn hàng chờ'],['new_ad_inquiries','Yêu cầu quảng cáo mới']];
export default function AdminHome(){
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);const router=useRouter();
 useEffect(()=>{fetch('/api/proxy/admin/overview',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.message||'Không có quyền quản trị');return d;}).then(setData).catch(e=>{setError(e.message);if(e.message.toLowerCase().includes('authentication'))router.replace('/login');}).finally(()=>setLoading(false));},[router]);
 return <AdminShell><div className="page-head"><div><div className="eyebrow">PLATFORM OVERVIEW</div><h1>Tổng quan hệ thống</h1><p>Theo dõi SaaS, ingestion, đơn hàng, nội dung và quảng cáo.</p></div><span className="status good">Live data</span></div>{loading?<div className="notice">Đang tải dashboard…</div>:error?<div className="notice error">{error}</div>:<><div className="grid-kpi">{cards.map(([key,label])=><div className="kpi" key={key}><span>{label}</span><strong>{(data?.[key]??0).toLocaleString('vi-VN')}</strong></div>)}</div><section className="section"><h2>Quản trị nhanh</h2><div className="grid-kpi"><Link className="panel" href="/customers"><strong>Khách hàng</strong><p className="muted">Workspace, thành viên, gói và trạng thái tài khoản.</p></Link><Link className="panel" href="/orders"><strong>Đơn hàng</strong><p className="muted">Theo dõi thanh toán, đơn chờ và hoàn tất.</p></Link><Link className="panel" href="/cms/pages"><strong>CMS & SEO</strong><p className="muted">Pages, bài viết, metadata và nội dung xuất bản.</p></Link><Link className="panel" href="/ads/campaigns"><strong>Quảng cáo</strong><p className="muted">Campaigns, advertiser inquiries và ad slots.</p></Link></div></section></>}</AdminShell>;
}
