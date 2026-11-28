# Index Assist — Preliminary security review

Updated: 2026-11-28
Branch reviewed: `feature/provider-job-engine` at current Redis throttling implementation checkpoint

## Scope and confidence

CI checkpoint update: run #184 passed on `1a9be1d87fa541866777475f28d0a6c3fe682bb4`; this validates repository tests only and does not change the release findings below.

This is a source/configuration review of the current repository state, not an independent penetration test, infrastructure audit, dependency audit, or production security certification. No live VPS, deployed network, provider account, secrets, or customer data were accessed.

## Positive controls observed

- API enables Helmet, explicit configured CORS origins, DTO whitelist/forbid-non-whitelisted validation, and bearer-token session checks.
- Authentication uses Argon2id password hashes, short-lived access tokens, hashed refresh/auth tokens, email verification, MFA/TOTP and single-use recovery codes.
- Provider credentials are encrypted with AES-256-GCM; OAuth state is HMAC-signed, stored by hash, expires and is consumed once.
- Provider operations are tenant-scoped and constrained to verified properties; worker DB connection uses the restricted runtime role.
- Docker workload ports are not published publicly in the checked compose file; API is bound to loopback on the host.
- Environment files are ignored by Git, with example templates retained.
- Backup scripts now encrypt archives with age, restrict local file permissions and validate checksum/archive. CI #178 passes mock tests for encryption flow, temporary plaintext cleanup, non-production restore guard and tamper rejection. CI #180 exercises age's real authenticated encryption/decryption with generated ephemeral keys and rejects a wrong identity; CI #183 also verifies rejection of an identity file accessible by group/other users. PostgreSQL utilities remain mocked; the live non-production restore drill and off-site/key-recovery policy remain outstanding. Off-site replication, key escrow and an actual restore drill remain outstanding.

## Findings and required actions

### High — Shared Redis throttling implemented; CI and live failure test pending

Evidence: `apps/api/src/throttling/redis-throttler.storage.ts` uses an atomic Redis Lua script for shared counters and block windows. `apps/api/src/app.module.ts` configures it as the Nest throttler storage; `REDIS_URL` is required, the API workload waits for Redis health, the Redis client disconnects on Nest shutdown, and rate-limited requests fail closed with HTTP 503 on Redis errors. Unit tests cover atomic command arguments, lazy connection, missing configuration and unavailable Redis; a Redis integration test uses two independent clients to verify shared counters/block state, and CI provisions Redis for the Node job.

Impact: this closes the process-local storage design gap in source, but it is not yet CI-verified in the latest branch checkpoint and no deployed multi-instance/Redis outage drill has been run.

Required before production: obtain passing CI, run two API instances against one non-production Redis and confirm shared limits, then stop Redis and confirm rate-limited requests fail closed without bypass. Configure production credentials outside the repository.

### High — Kafka/Redpanda transport has no authentication, TLS or ACLs

Evidence: `infra/docker/compose.infrastructure.yml` starts Redpanda with internal plaintext Kafka listener and no broker authentication/ACL configuration.

Impact: internal-network or host compromise can potentially read/publish queue messages or impersonate producers/consumers.

Required before production: enable authenticated TLS transport and least-privilege ACLs for API/outbox relay/crawler/provider worker; rotate credentials and test denied access. Current compose network isolation is a useful boundary, not a substitute for broker authentication.

### High — Off-host recovery policy and key-management drill are not implemented

Evidence: `infra/postgres/backup.sh` now encrypts custom-format dumps with age before writing final artifacts and verifies the encrypted-file SHA-256 checksum. The runbook still does not implement off-site replication, retention, PITR, monitoring or key escrow; the age private identity must be managed outside this repository.

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
