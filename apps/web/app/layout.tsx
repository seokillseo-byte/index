import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://index-assist.io.vn'),
  title: { default: 'Index Assist | Backlink Discovery & Index Monitoring', template: '%s | Index Assist' },
  description: 'Analyze backlink crawlability, organize tiered links, and monitor search visibility with Index Assist.',
  robots: { index: true, follow: true },
  openGraph: { type: 'website', siteName: 'Index Assist', url: 'https://index-assist.io.vn' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="site-header"><Link className="brand" href="/">INDEX ASSIST</Link>
      <nav aria-label="Main navigation"><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/blog">Blog</Link></nav>
      <div className="header-actions"><Link href="/login">Log in</Link><Link className="button button-small" href="/register">Get started</Link></div>
    </header>
    <main>{children}</main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} Index Assist</span><span>Backlink discovery · Crawl analysis · Index monitoring</span><Link href="/privacy">Privacy</Link></footer>
  </body></html>;
}
