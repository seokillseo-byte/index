# Index Assist — Preliminary security review

Updated: 2026-11-28
Branch reviewed: `feature/provider-job-engine` at `8e6285f020e94c2b2fb122e5805426c279b8328d`

## Scope and confidence

This is a source/configuration review of the current repository state, not an independent penetration test, infrastructure audit, dependency audit, or production security certification. No live VPS, deployed network, provider account, secrets, or customer data were accessed.

## Positive controls observed

- API enables Helmet, explicit configured CORS origins, DTO whitelist/forbid-non-whitelisted validation, and bearer-token session checks.
- Authentication uses Argon2id password hashes, short-lived access tokens, hashed refresh/auth tokens, email verification, MFA/TOTP and single-use recovery codes.
- Provider credentials are encrypted with AES-256-GCM; OAuth state is HMAC-signed, stored by hash, expires and is consumed once.
- Provider operations are tenant-scoped and constrained to verified properties; worker DB connection uses the restricted runtime role.
- Docker workload ports are not published publicly in the checked compose file; API is bound to loopback on the host.
- Environment files are ignored by Git, with example templates retained.
- Backup scripts restrict local file permissions and validate archive/checksum, but do not encrypt the archive.

## Findings and required actions

### High — API rate limits are process-local

Evidence: `apps/api/src/app.module.ts` configures Nest Throttler with the default storage and a global 120/minute limit; endpoint-specific authentication limits are also configured in controllers. No shared Redis throttler storage is configured in this branch.

Impact: limits can multiply across API replicas/restarts and do not provide a reliable shared abuse-control boundary.

Required before multi-replica/public production: configure and test shared Redis-backed throttler storage, including behavior when Redis is unavailable. Do not describe the current in-memory limits as distributed protection.

### High — Kafka/Redpanda transport has no authentication, TLS or ACLs

Evidence: `infra/docker/compose.infrastructure.yml` starts Redpanda with internal plaintext Kafka listener and no broker authentication/ACL configuration.

Impact: internal-network or host compromise can potentially read/publish queue messages or impersonate producers/consumers.

Required before production: enable authenticated TLS transport and least-privilege ACLs for API/outbox relay/crawler/provider worker; rotate credentials and test denied access. Current compose network isolation is a useful boundary, not a substitute for broker authentication.

### High — Backup artifacts are not encrypted and no off-host recovery policy is implemented

Evidence: `infra/postgres/backup.sh` writes a custom-format dump and SHA-256 checksum; it does not encrypt the dump or perform off-site replication. The runbook explicitly excludes retention, PITR and monitoring.

Impact: anyone obtaining a backup file may read customer and credential-related database contents; local disk loss can also destroy both database and backup.

Required before production: encrypt backups using an approved key-management process, store copies separately from the VPS, define retention/access logging, and decide/test PITR or an explicitly accepted recovery-point objective. Keep encryption keys outside the backup and repository.

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
