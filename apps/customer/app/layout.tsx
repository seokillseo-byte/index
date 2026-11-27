import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Index Assist · Workspace',description:'Backlink indexing SaaS workspace'};
export default function CustomerLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
