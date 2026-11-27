# Production VPS architecture

## Deployment topology

The first deployment target is a high-performance VPS. A single VPS is not highly available and remains a single point of failure. For sustained production operation, separate roles across VPS instances where possible:

- VPS A: reverse proxy, public Next.js applications, API/control plane.
- VPS B: PostgreSQL primary, Redis, encrypted off-host backups.
- VPS C: event broker and stateless ingestion/crawl workers.
- VPS D (scale-out): ClickHouse and object-storage gateway.

The Compose stack in this repository is a reproducible infrastructure bootstrap and integration environment. A one-node broker and one VPS do not provide HA. Before publishing an availability SLA, add independent failure domains, tested backup restoration, monitoring, and failover procedures.

## Capacity

The product target is 1,000,000 accepted URL records/day (11.6 records/second average). Load-test realistic payload sizes, import bursts, per-tenant fairness, and retry storms. Ingestion throughput is separate from crawler throughput and from third-party search-engine crawl/index decisions.

## Network and crawler security

- Expose only the reverse proxy on public ports 80/443.
- Bind PostgreSQL, Redis, broker, ClickHouse, and object storage to loopback/private networks.
- Restrict worker egress.
- Reject loopback, link-local, RFC1918, IPv6 unique-local, multicast, and cloud metadata addresses.
- Resolve and validate DNS at connection time and revalidate every redirect.
- Enforce per-host concurrency, response size, connection/read timeouts, redirect caps, and content-type allowlists.

## Search engine constraints

- Google Search Console URL Inspection applies only to verified properties and published quotas.
- Do not use the Google Indexing API for ordinary backlink URLs.
- IndexNow submissions are restricted to verified hostnames controlled by the tenant.
- Store API acknowledgements separately from crawl observations and verified index outcomes.

## Advertising and privacy

- Isolate ad delivery from authenticated processing workflows.
- Clearly label paid placements and sponsored content.
- Respect consent requirements and applicable network policies.
- Do not make ads resemble system controls, queue status, or search-engine verification.
- Apply invalid-traffic filtering and replay protection to click/impression events.
