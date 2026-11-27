# Index Assist

Production-oriented multi-tenant SaaS for backlink discovery, crawlability analysis, search visibility monitoring, and SEO automation.

**Primary domain:** https://index-assist.io.vn

## Product surfaces

- `apps/web`: public multi-page marketing website and SEO CMS rendering.
- `apps/admin`: privileged administration console for customers, orders, billing, CMS, and advertising operations.
- `apps/customer`: tenant-isolated SaaS workspace.
- `apps/api`: versioned application API and control plane.
- `services/*`: ingestion, crawling, analysis, discovery, monitoring, and search-engine integrations.

## Production principles

1. Tenant isolation is enforced server-side and in PostgreSQL row-level security policies.
2. Google indexing is never represented as guaranteed. Google Search Console inspection is limited to verified properties and published quotas; no generic Google indexing endpoint is assumed.
3. IndexNow submissions are restricted to verified hostnames.
4. Crawling is defensive by default: SSRF protections, DNS/IP validation, redirect revalidation, response limits, timeouts, and per-host rate limits.
5. All asynchronous work is idempotent, observable, retryable, and has a dead-letter path.
6. Ad placements are consent-aware, policy-compliant, clearly labeled, and configurable by surface and subscription tier.

## Initial delivery architecture

- Frontend: Next.js App Router, TypeScript, Tailwind CSS.
- API: NestJS, TypeScript, OpenAPI.
- Workers: Go for high-volume HTTP processing; Python for SEO/content analysis.
- Data: PostgreSQL for transactional data, ClickHouse for event analytics, Redis for cache/coordination, Kafka-compatible event streaming, S3-compatible object storage.
- Runtime: Docker Compose for reproducible single-VPS deployment; Kubernetes-ready manifests and IaC for future horizontal expansion.

## Important capacity note

The target is **1,000,000 URL ingestion records/day**, with burst capacity validated by load tests. This is not a promise that Google or Bing will crawl or index one million URLs/day. Search-engine quotas, hostname ownership, crawl policies, and index selection remain external constraints.

## Repository status

This repository is the source of truth. Production readiness requires passing unit, integration, end-to-end, security, backup/restore, and load tests in the target VPS environment before public launch.
