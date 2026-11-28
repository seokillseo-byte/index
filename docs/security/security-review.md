# Index Assist — Preliminary security review

Updated: 2026-11-28
Branch reviewed: `feature/provider-job-engine` after Redis recovery and Redpanda security-template updates

## Scope and confidence

CI #286 passed on `da76342e9d0e295e565c45e3e541778f59565f5d` (Node, crawler and database jobs). This is the latest fully verified checkpoint before the multi-recipient backup source change in this review turn; that source change requires a new CI run.

This is a source/configuration review of the current repository state, not an independent penetration test, infrastructure audit, dependency audit, or production security certification. No live VPS, deployed network, provider account, secrets, or customer data were accessed.

## Positive controls observed

- API enables Helmet, explicit configured CORS origins, DTO whitelist/forbid-non-whitelisted validation, and bearer-token session checks.
- Authentication uses Argon2id password hashes, short-lived access tokens, hashed refresh/auth tokens, email verification, MFA/TOTP and single-use recovery codes.
- Provider credentials are encrypted with AES-256-GCM; OAuth state is HMAC-signed, stored by hash, expires and is consumed once.
- Provider operations are tenant-scoped and constrained to verified properties; worker DB connection uses the restricted runtime role.
- Docker workload ports are not published publicly in the checked compose file; API is bound to loopback on the host.
- Environment files are ignored by Git, with example templates retained.
- Backup scripts now encrypt archives with age, restrict local file permissions and validate checksum/archive. CI #178 passes mock tests for encryption flow, temporary plaintext cleanup, non-production restore guard and tamper rejection. CI #180 exercises age's real authenticated encryption/decryption with generated ephemeral keys and rejects a wrong identity; CI #183 also verifies rejection of an identity file accessible by group/other users. CI #286 passed before the latest multi-recipient change; PostgreSQL utilities remain mocked and a live restore drill remains outstanding. The runbook now documents off-site replication and recovery-custody requirements, and the backup script now supports multiple age recipients; actual off-site storage, retention, protected key custody and recovery-key retrieval are still not configured.

## Findings and required actions

### High — Shared Redis throttling implemented and CI-verified; live failure test pending

Evidence: `apps/api/src/throttling/redis-throttler.storage.ts` uses an atomic Redis Lua script for shared counters and block windows. `apps/api/src/app.module.ts` configures it as the Nest throttler storage; `REDIS_URL` is required, the API workload waits for Redis health, readiness checks Redis and PostgreSQL, the Redis client disconnects on Nest shutdown, Redis uses `noeviction` to protect active counters, and rate-limited requests fail closed with HTTP 503 on Redis errors or memory-limit write rejection. Unit tests cover atomic command arguments, lazy connection, missing configuration and unavailable Redis; a Redis integration test uses two independent clients to verify shared counters/block state, and CI provisions Redis for the Node job.

Impact: the process-local storage gap is closed in source and CI #276/#277/#286 verify the two-client integration and reconnect/fail-closed regression paths. No deployed multi-instance/Redis outage drill has been run.

Required before production: run two API instances against one non-production Redis and confirm shared limits, then stop Redis and confirm rate-limited requests fail closed without bypass. Configure production credentials outside the repository and alert on Redis memory pressure/unavailability.

### High — Kafka client security is implemented, but broker TLS/SASL/ACL activation remains open

Evidence: Node outbox relay/provider worker and Go crawler now support CA-verified TLS and SCRAM-SHA-512; production startup rejects plaintext client settings. However `infra/docker/compose.infrastructure.yml` still starts end-of-support Redpanda `v24.3.7` with an internal plaintext listener; its `redpanda-init` job uses anonymous plaintext Kafka and cannot be reused after SASL is enabled. A v26.3.1 broker template, first-start Admin API bootstrap example and ACL runbook are provided but are not mounted or active. The template keeps the Admin API loopback-only and requires authentication via the bootstrap file.

Impact: until the broker listener, users and ACLs are activated together, the internal broker remains unauthenticated and queue traffic is not encrypted. Production workers will fail closed rather than connect with plaintext.

Required before production: rehearse the persistent-volume upgrade path to a supported Redpanda release; provision broker/Admin certificates and distinct service SCRAM credentials; protect the Admin API before first startup; replace anonymous topic initialization with authenticated provisioning; activate TLS/SASL/ACLs on non-production Redpanda; verify allowed producer/consumer operations and denied cross-topic/group access. Only then roll out the reviewed configuration in production.

### High — Off-host recovery policy and key-management drill are documented but not configured

Evidence: `infra/postgres/backup.sh` encrypts custom-format dumps with age before writing final artifacts and verifies the encrypted-file SHA-256 checksum. It now supports multiple independent age recipients and records public recipients in the manifest. The runbook documents off-site replication, retention and key-recovery controls, but no remote destination, retention lifecycle, PITR, monitoring or protected key custody is configured; the age private identities must be managed outside this repository.

Impact: compromise of the age private identity or loss of both the VPS and its local backup can expose data or make recovery impossible. A local encrypted artifact alone is not a disaster-recovery plan.

Required before production: store encrypted copies separately from the VPS, define retention/access logging, protect and escrow the age private identity through an approved key-management process, and decide/test PITR or an explicitly accepted recovery-point objective. Execute a restore drill using the separately recovered identity. Keep encryption keys outside the backup and repository.

### Medium — Database transport encryption is not enabled in the example deployment

Evidence: `.env.api.example` sets `DATABASE_SSL=false`; Compose currently places services on a private Docker network and binds host database ports to loopback.

Impact: traffic is not encrypted on the container network. This is a risk if the network boundary is shared or later spans hosts.

Required before multi-host deployment: enforce PostgreSQL TLS with certificate verification and configure clients accordingly. For the current single-host deployment, document the trusted-host/network assumption and restrict Docker network access.

### Medium — Security monitoring and alerting are not configured

Evidence: no Prometheus/Grafana/OTel/alert rule files were found in the repository tree; worker uses console logs and the API exposes readiness health checks.

Impact: authentication abuse, repeated provider failures, queue age growth, dead-letter accumulation and infrastructure saturation may not be detected promptly.

Required before public production: define log retention/access controls and alerts for auth failures/rate-limit events, API error rate, queue depth/oldest age, dead letters, provider auth/quota failures, DB connections/locks/storage, backup freshness and restore failures.

### Medium — No independent penetration/dependency review evidence

Evidence: repository CI runs build/typecheck/unit/database tests, but no independent penetration test or security sign-off artifact was found during this review.

Required before public production: run dependency/SBOM and vulnerability review, inspect exposed routes and authorization boundaries, test tenant isolation and OAuth flows, and obtain a documented reviewer sign-off.

## Lower-risk controls and follow-up

- Keep `OPENAPI_ENABLED=false` in production unless documentation exposure is explicitly approved.
- Keep CORS origins restricted to known application origins; do not use wildcard origins with credentials.
- Keep production env files and database URLs out of GitHub issues, logs and chat.
- Pin GitHub Actions to reviewed immutable commit SHAs as part of supply-chain hardening.
- Review container image update cadence and vulnerability scanning before release.

## Decision

**Not security-approved for public production yet.** The findings above are release gates, not evidence of a confirmed exploit. The next technical work remains within existing scope: shared rate limiting, broker transport security, backup encryption/off-host policy, monitoring/alerting and external review. No production secrets or infrastructure were changed during this review.
