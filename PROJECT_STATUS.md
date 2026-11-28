# Index Assist — Project Status

Updated: 2026-11-28

## Current implementation state

- Product target: multi-tenant backlink URL discovery and indexing-workflow SaaS with Google and Bing provider integrations.
- Capacity target: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps; this is not a measured throughput result.
- Main baseline: `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Review PR #6 remains open and unmerged.
- Branch diverged from main (one base commit behind); do not rebase or merge automatically. Review the effective diff before integration.

## Authentication and tenant isolation

- Email verification is single-use, expires after 30 minutes, and is required before login/refresh can issue sessions.
- MFA/TOTP enrollment and login, hashed single-use recovery codes, MFA challenge lockout after five failed attempts, password recovery, and server-side session management are implemented.
- Password reset and MFA disable revoke existing sessions.
- Tenant/session isolation tests cover JWT session binding, tenant-switch rejection, and session revocation ownership.
- MFA enrollment, disable, and single-active challenge issuance use transactional row locking.
- API Jest tests and database regression tests cover MFA lockout, auth-token replay, recovery-code replay, and tenant RLS.

## Provider job engine

- Tenant-aware project/backlink verification and verified-property binding.
- Google Search Console and Bing Webmaster integrations with AES-256-GCM encrypted credentials.
- Provider job persistence, transactional outbox, Kafka `provider.jobs` topic, and isolated provider worker.
- Google URL Inspection reservation controls are bounded by per-site daily/minute limits.
- Bing URL submission checks live DailyQuota/MonthlyQuota.
- Retry/backoff, dead-letter handling, lease recovery, batch draining, idempotency, provider job history, attempt timestamps, and provider-job indexes are implemented.
- Provider acceptance and Google inspection evidence are not treated as proof of indexing.

## CI validation

- Added a push trigger for `feature/provider-job-engine` so implementation commits run CI without relying only on PR events.
- CI run [#46101301044](https://github.com/seokillseo-byte/index/actions/runs/46101301044) passed on `af3fc9c8b9f2375dd945266ac0ce86d1975f2d9b`.
- CI run [#46101487019](https://github.com/seokillseo-byte/index/actions/runs/46101487019) passed on `ac3bb0968ce1bc097337cdf2f9b22241e3fce057`, validating the status/checklist/changelog checkpoint.
- Both runs passed Node install/typecheck/build/Jest/worker syntax checks, crawler Go tests with race detector and vet, and database migrations plus tenant RLS/MFA/auth-token/recovery-code regression tests.
- CI run [#46102361891](https://github.com/seokillseo-byte/index/actions/runs/46102361891) passed on `67f8447801b8837550fcdba607f09932be82eb29`, including Node typecheck/build/Jest/worker syntax, Go race tests/vet, and database migration/RLS/auth regression checks.
- CI run [#46102488732](https://github.com/seokillseo-byte/index/actions/runs/46102488732) passed on `8ee786ce6fec4448db0f5755b602345aeaefb39e`.
- CI run [#46102607623](https://github.com/seokillseo-byte/index/actions/runs/46102607623) passed on current source head `0c50dc59380dabb99d597af5feabc17b641c8951`; Node typecheck/build/Jest and both worker syntax checks, Go race tests/vet, ordered DB migrations, tenant RLS, MFA lockout, auth-token replay, and MFA recovery-code replay all passed.
- The benchmark harness now reports queue-latency p50/p95/p99, PostgreSQL counter deltas and connection snapshots; host CPU/disk IO still require host-level monitoring.
- Any later source change must be validated by its own run.

## Benchmark checkpoint

- A dedicated non-production PostgreSQL queue benchmark harness and runbook exist.
- Harness measures PostgreSQL queue claim/update throughput only; it does not call Google/Bing and cannot prove end-to-end provider submission throughput.
- No benchmark has yet been run against dedicated non-production hardware.
- No evidence currently establishes 1,000,000 URLs/day.

## Remaining release gates

1. Run queue benchmark against a dedicated non-production database and record jobs/sec, queue latency, PostgreSQL CPU/IO, connections and saturation.
2. Run sustained queue/backpressure and failure/recovery benchmarks.
3. Run real Google/Bing end-to-end tests with non-production provider accounts.
4. Complete backup/restore drill, security review, and observability/alerting review.
5. Complete production VPS, HTTPS and DNS validation only after the preceding gates and explicit release approval.
6. Assess the 1,000,000 URL/day target only from measured end-to-end capacity; no current claim is made.

## Immediate next step

Execute the existing non-production queue benchmark on a dedicated test database/hardware. Do not add unrelated features, use production credentials/data, merge into `main`, or deploy production as part of this checkpoint.
