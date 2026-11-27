# Implementation status

This repository is being built incrementally toward production. A successful Git commit is not equivalent to a tested or deployed production release.

## Landed foundation

- Monorepo workspace and Turbo task graph.
- Separate Next.js public, admin, and customer application shells.
- NestJS API bootstrap with validation, Helmet, CORS allowlist, rate limiting, OpenAPI opt-in, and liveness/readiness endpoints.
- PostgreSQL initial schema for tenants, membership, projects, URL inventory, tier relationships, campaigns, observations, integrations, orders, payments, CMS, and advertising inventory.
- Initial tenant RLS policies and additional RLS hardening migration.
- VPS infrastructure Compose foundation for PostgreSQL, Redis, Redpanda, ClickHouse, and MinIO.
- Go Kafka consumer for URL ingestion events, tenant-scoped task leasing, robots.txt policy checks, HTTP health inspection, retry events, and SSRF-resistant outbound transport.
- CI workflow for Node workspaces and Go crawler tests.

## Not yet production-ready

- Authentication, MFA enrollment, session rotation, password reset, and admin bootstrap.
- Full authorization guards and tenant context propagation in API transactions.
- Database connection pool, migration runner, secrets manager, and backup/restore automation.
- Broker authentication/TLS and ACLs, DLQ policy, consumer metrics, and load-tested worker autoscaling; the transactional outbox relay and first crawler consumer are implemented.
- HTML analysis, backlink verification, discovery integrations, Google Search Console OAuth, and Bing/IndexNow verification workflows.
- Admin CMS, customer dashboard, orders, payment-provider webhooks, ad serving, consent controls, and analytics UI.
- CI execution confirmation, load/security/recovery/end-to-end tests on the selected VPS, and tenant RLS integration run.

## Release gate

Do not expose the Admin or Customer surfaces to real users or accept payments until authentication, authorization, tenant isolation tests, payment idempotency, and audit logging are verified. Do not claim a URL is indexed based solely on a submission acknowledgement or a public search operator query.
