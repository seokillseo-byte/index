# Backend security and ingestion

## Implemented in repository

- Argon2id password hashing, short-lived JWT access tokens, random opaque refresh tokens stored as SHA-256 hashes, refresh rotation, server-side session revocation.
- Public registration creates a workspace and owner membership transactionally.
- JWT guard checks issuer/audience, signature, expiry, and active server-side session.
- Tenant context is bound to the token. Cross-tenant header switching is rejected.
- Forced RLS on tenant membership supports self-membership reads through a server-set auth context; tenant writes use a transaction-local tenant context.
- Bulk URL ingestion accepts at most 5,000 URLs/request, normalizes HTTP(S), rejects embedded credentials, hashes URLs for deduplication, persists processing tasks and a transactional outbox event.
- Kafka outbox relay publishes with leases, retries and at-least-once delivery semantics. The Go crawler consumer claims tenant-scoped tasks, checks robots policy, performs SSRF-safe HTTP health checks, records observations and schedules retry events. Consumers must remain idempotent because delivery is at least once.

## Security work still required before public production

- Email verification and account recovery delivery, MFA/WebAuthn, distributed brute-force controls, device/session management.
- Separate least-privilege database roles for migration, API, and relay processes; rotate all secrets and use a secrets manager.
- Tenant-scoped authorization tests for every repository query and RLS integration tests using the actual non-owner runtime role.
- Redis-backed distributed throttling and tenant quota reservation for concurrent imports.
- Broker authentication/TLS, topic ACLs, retention policies, dead-letter topic, consumer metrics and operational alerting.
- Extend crawler conformance testing and monitoring for SSRF protection, redirects, DNS rebinding and robots policy.
- Load testing at 1M URLs/day and recovery/backup drills.

## Operational semantics

The ingestion API reports accepted into the Index Assist queue. It does not mean the source URL was crawled, submitted to a search engine, crawled by Google/Bing, or indexed. Search-engine status must be represented as separate observations with evidence and timestamps.
