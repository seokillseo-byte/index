# Implementation status

This repository is being built incrementally toward production. A successful Git commit is not equivalent to a tested or deployed production release.

## Landed foundation

- Monorepo workspace and Turbo task graph.
- Separate Next.js public, admin, and customer application shells.
- NestJS API bootstrap with validation, Helmet, CORS allowlist, rate limiting, OpenAPI opt-in, and liveness/readiness endpoints.
- PostgreSQL initial schema for tenants, membership, projects, URL inventory, tier relationships, campaigns, observations, integrations, orders, payments, CMS, and advertising inventory.
- Initial tenant RLS policies and additional RLS hardening migration.
- VPS infrastructure Compose foundation for PostgreSQL, Redis, Redpanda, ClickHouse, and MinIO.
- Go crawler health service and SSRF-resistant URL validation/transport foundation.
- CI workflow for Node workspaces and Go crawler tests.

## Not yet production-ready

- Authentication, MFA enrollment, session rotation, password reset, and admin bootstrap.
- Full authorization guards and tenant context propagation in API transactions.
- Database connection pool, migration runner, secrets manager, and backup/restore automation.
- Kafka topic contracts, durable ingestion pipeline, worker consumers, retries, DLQ, and per-tenant quotas.
- Full crawl engine, HTML analyzer, backlink verification, discovery integrations, Google Search Console OAuth, and Bing/IndexNow verification workflows.
- Admin CMS, customer dashboard, orders, payment-provider webhooks, ad serving, consent controls, and analytics UI.
- Load, security, recovery, and end-to-end tests on the selected VPS.

## Release gate

Do not expose the Admin or Customer surfaces to real users or accept payments until authentication, authorization, tenant isolation tests, payment idempotency, and audit logging are verified. Do not claim a URL is indexed based solely on a submission acknowledgement or a public search operator query.
