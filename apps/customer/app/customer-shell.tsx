'use client';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
const groups=[{label:'Workspace',items:[['/','Tổng quan'],['/projects','Projects'],['/ingestion','Import URL'],['/backlinks','Backlinks']]},{label:'Search engines',items:[['/integrations','Google & Bing']]},{label:'Tài khoản',items:[['/billing','Gói dịch vụ & Billing']]}];
export function CustomerShell({children}:{children:React.ReactNode}){
 const path=usePathname(),router=useRouter();
 async function logout(){await fetch('/api/session',{method:'DELETE'});router.push('/login');router.refresh();}
 return <div className="customer-shell"><aside className="customer-sidebar"><div className="brand">INDEX ASSIST<small>SEO WORKSPACE</small></div>{groups.map(g=><div className="nav-group" key={g.label}><div className="nav-label">{g.label}</div>{g.items.map(([href,label])=><Link className={'nav-link '+(path===href?'active':'')} href={href} key={href}>{label}</Link>)}</div>)}<div className="sidebar-bottom">Backlink Indexing Workspace<br/>Tenant isolated</div></aside><main className="customer-main"><header className="topbar"><strong>WORKSPACE CONSOLE</strong><button onClick={logout}>Đăng xuất</button></header><div className="content">{children}</div></main></div>;
}
