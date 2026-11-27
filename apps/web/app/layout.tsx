import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:{default:'Index Assist — Backlink Indexing Platform',template:'%s | Index Assist'},description:'Nền tảng quản lý backlink, URL ingestion và theo dõi trạng thái Google Search Console và Bing Webmaster.'};
export default function WebLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
