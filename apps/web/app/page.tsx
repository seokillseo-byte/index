import Link from 'next/link';

const features = [
  ['Tier-aware backlink management','Organize Tier 1 through Tier N with explicit source-to-target relationships.'],
  ['Technical crawlability analysis','Inspect HTTP responses, robots directives, canonical signals, and backlink presence.'],
  ['Evidence-based index monitoring','Keep submission acknowledgements separate from observed crawling and verified index status.'],
];

export default function HomePage() {
  return <>
    <section className="hero">
      <div className="eyebrow">SEO intelligence platform</div>
      <h1>Know what search engines can discover.</h1>
      <p>Index Assist helps SEO teams organize tiered backlinks, diagnose crawlability issues, and monitor search visibility with evidence instead of guesswork.</p>
      <div className="hero-actions"><Link className="button" href="/register">Create your workspace</Link><Link className="secondary" href="/features">Explore the platform</Link></div>
    </section>
    <section className="feature-grid">{features.map(([title,description])=><article className="feature-card" key={title}><h2>{title}</h2><p>{description}</p></article>)}</section>
  </>;
}
