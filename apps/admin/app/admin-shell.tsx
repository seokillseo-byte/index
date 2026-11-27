'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
const groups=[{label:'Tổng quan',items:[['/','Dashboard'],['/customers','Khách hàng'],['/orders','Đơn hàng']]},{label:'Nội dung & tăng trưởng',items:[['/cms/pages','CMS Pages'],['/cms/posts','Blog & SEO'],['/ads/campaigns','Chiến dịch quảng cáo'],['/ads/inquiries','Nhà quảng cáo'],['/ads/slots','Vị trí quảng cáo']]},{label:'Hệ thống',items:[['/audit','Audit log']]}];
export function AdminShell({children}:{children:React.ReactNode}){
 const path=usePathname(),router=useRouter();
 async function logout(){await fetch('/api/session',{method:'DELETE'});router.push('/login');router.refresh();}
 return <div className="admin-shell"><aside className="admin-sidebar"><div className="brand">INDEX ASSIST<small>PLATFORM CONTROL</small></div>{groups.map(g=><div className="nav-group" key={g.label}><div className="nav-label">{g.label}</div>{g.items.map(([href,label])=><Link className={'nav-link '+(path===href?'active':'')} href={href} key={href}>{label}</Link>)}</div>)}<div className="sidebar-bottom">Index Assist · Admin Console<br/>Restricted platform access</div></aside><main className="admin-main"><header className="topbar"><strong>PLATFORM ADMINISTRATION</strong><button onClick={logout}>Đăng xuất</button></header><div className="content">{children}</div></main></div>;
}
