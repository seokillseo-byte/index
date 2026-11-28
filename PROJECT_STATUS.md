# Index Assist — Project Status

Updated: 2026-11-28

## Current implementation state

- Product target: multi-tenant backlink URL discovery and indexing-workflow SaaS with Google and Bing provider integrations.
- Capacity target: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps; this is a target specification, not a measured throughput result.
- Main baseline: `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Latest reviewed feature-branch checkpoint before this status update: `1a9be1d87fa541866777475f28d0a6c3fe682bb4`.
- Review PR #6 remains open and unmerged.
- GitHub reports the branch diverged from main: 186 commits ahead, one commit behind; PR mergeable=false. The one main-only commit overlaps provider-engine files. Do not rebase or merge automatically; review the effective diff before integration.
- No local working-tree status is available in this workflow; this status reflects GitHub branch/PR data only.

## Authentication and tenant isolation

- Email verification is single-use, expires after 30 minutes, and is required before login/refresh can issue sessions.
- MFA/TOTP enrollment and login, hashed single-use recovery codes, MFA challenge lockout after five failed attempts, password recovery, and server-side session management are implemented.
- Password reset and MFA disable revoke existing sessions.
- Tenant/session isolation tests cover JWT session binding, tenant-switch rejection, and session revocation ownership.
- MFA enrollment, disable, and single-active challenge issuance are transactionally serialized.
- API Jest tests and database regression tests cover MFA lockout, auth-token replay, recovery-code replay, and tenant RLS.

## Provider job engine

- Tenant-aware project/backlink verification and verified-property binding; URL-prefix matching enforces path-segment boundaries.
- Google Search Console and Bing Webmaster integrations with AES-256-GCM encrypted credentials.
- Provider job persistence, transactional outbox, Kafka `provider.jobs` topic, and isolated provider worker.
- Google URL Inspection queue admission and worker execution enforce per-property daily/minute limits; worker reservations are serialized in PostgreSQL across worker instances.
- Bing URL submission checks live DailyQuota/MonthlyQuota.
- Retry/backoff, dead-letter handling, lease recovery, batch draining, idempotency, provider job history, attempt timestamps, and provider-job indexes are implemented.
- Provider acceptance and Google inspection evidence are not treated as proof of indexing.

## CI validation

- CI #184 passed on commit `1a9be1d87fa541866777475f28d0a6c3fe682bb4`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46107552896).
- All three jobs passed: database migrations plus tenant RLS/MFA/auth-token/recovery-code regression SQL; crawler Go race tests and vet; Node dependency install, typecheck, build, Jest, provider worker syntax checks, backup/restore shell syntax and age-encryption regression tests.
- Earlier backup security checkpoints also passed: CI #180 validates real age encryption/decryption and wrong-identity rejection; CI #183 validates owner-only age identity permissions.
- CI coverage does not replace a live PostgreSQL restore drill, provider-account E2E, or production-like capacity benchmark.
- Any later source change requires its own CI run.

## Backup and recovery

- PostgreSQL custom-format backups are created in a private temporary directory, validated, age-encrypted before final storage, checksummed and manifested; plaintext temporary dumps are removed.
- Restore verifies checksum, enforces owner-only age identity file permissions, decrypts to a private temporary directory, validates the archive and requires explicit non-production/empty-target operator confirmations.
- CI tests use mocked PostgreSQL utilities; age cryptography is exercised with ephemeral test identities.
- No live PostgreSQL restore drill, off-site replication, retention policy, PITR, key escrow or independent recovery-key retrieval test has been completed.

## Benchmark checkpoint

- A dedicated non-production PostgreSQL queue benchmark harness and runbook exist.
- Harness measures PostgreSQL queue claim/update throughput only; it does not call Google/Bing and cannot prove end-to-end provider submission throughput.
- No benchmark has yet been run against dedicated non-production hardware.
- No evidence currently establishes 1,000,000 URLs/day.

## Remaining release gates

1. Execute queue benchmark on dedicated non-production database/hardware; record jobs/sec, p50/p95/p99 queue latency, DB CPU/IO, connections and saturation.
2. Execute sustained queue/backpressure and worker failure/recovery protocols; retain metrics and evidence.
3. Run real Google/Bing end-to-end tests with non-production provider accounts.
4. Configure shared Redis-backed API rate limiting and test Redis outage behavior.
5. Enable Kafka/Redpanda TLS, authentication and least-privilege ACLs for API/outbox relay/crawler/provider worker; test denied access.
6. Configure protected off-site encrypted backups, retention, age identity recovery/key escrow and execute a non-production restore drill.
7. Implement metrics/logging/alerting, define thresholds/owners and test alert delivery in non-production.
8. Complete independent security/dependency review and resolve findings.
9. Complete production VPS, HTTPS and DNS validation only after prior gates and explicit release approval.
10. Assess the 1,000,000 URL/day target only from measured end-to-end capacity; no current claim is made.

## Immediate next step

The next executable step requires a dedicated non-production PostgreSQL environment and host-level access for the existing benchmark/restore drills. Do not use production credentials/data, merge into `main`, deploy production, or add unrelated features. In parallel, continue only the existing security release gates (shared Redis throttling and Kafka transport security) after validating their exact runtime/package contracts.
