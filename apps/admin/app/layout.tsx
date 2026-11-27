import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Index Assist · Admin',description:'Platform administration console',robots:{index:false,follow:false}};
export default function AdminLayout({children}:{children:React.ReactNode}){return <html lang="vi"><body>{children}</body></html>}
