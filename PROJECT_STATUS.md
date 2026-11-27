# Index Assist — Project Status

Updated: 2026-11-28

## Current implementation state

- Production target: multi-tenant SaaS with Google + Bing provider integrations.
- Target VPS capacity: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps; this is a target, not a measured capacity result.
- Current repository baseline: `main` at `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Review PR: #6 remains open and unmerged.
- The branch has diverged from `main`; do not merge/rebase automatically. Review the one-commit base divergence deliberately before integration.

## Authentication implementation completed

- Email verification tokens are single-use and expire after 30 minutes.
- Registration sends verification email through Resend and does not issue sessions before verification.
- Login and refresh reject unverified accounts.
- Verification and resend endpoints are rate-limited.
- MFA login/recovery and enrollment/disable endpoints have explicit rate limits.
- DTO validators use valid Unicode-property and six-digit TOTP patterns.
- TOTP MFA enrollment, verification and MFA-gated login are implemented.
- MFA recovery codes are one-time and stored as SHA-256 hashes.
- Password recovery uses single-use 30-minute tokens and revokes existing sessions after reset.
- Server-side session listing, individual revocation and revoke-all controls are implemented.

**Validation caveat:** the authentication implementation has not yet been validated by a successful CI run or focused auth security test suite. Do not mark it production-ready until those checks pass.

## Provider engine implemented

- Tenant-aware project and backlink verification modules.
- Google Search Console and Bing Webmaster OAuth integrations.
- Encrypted provider credentials with AES-256-GCM.
- Verified-property binding and URL coverage checks.
- Provider job persistence and transactional outbox.
- Kafka `provider.jobs` topic and isolated provider worker.
- Google URL Inspection queue with property-scoped daily/minute reservation controls.
- Bing URL submission queue with live DailyQuota/MonthlyQuota checks.
- Retry/backoff, dead-letter handling, lease recovery and batch draining.
- Provider job history API, attempt timestamp tracking and provider-job indexes.
- Runtime tenant RLS/provider-job claim and quota SQL checks.

## Benchmark harness checkpoint

- Added a non-production PostgreSQL queue benchmark harness.
- Fixed its worker lease owner, isolated concurrent runs by unique idempotency prefix, validated numeric limits, and made cleanup run-scoped in a `finally` block.
- Reports seed duration separately from queue-drain throughput.
- This harness measures only PostgreSQL queue claim/update performance; it does not call Google/Bing and does not establish end-to-end provider throughput.
- The benchmark has **not** yet been executed against a dedicated non-production database.

## CI and release validation

- Previous CI run `46047692879` passed for an earlier provider-engine checkpoint only.
- No workflow run is currently visible for the latest authentication/benchmark changes. Current branch validation is therefore pending.
- Google URL Inspection reservation values are capped at 2,000/day and 600/minute per site.
- Bing submissions are bounded by live provider DailyQuota/MonthlyQuota.
- Provider acceptance/inspection evidence must not be presented as proof of indexing.

## Release gates still open

- CI/typecheck/build and tests for the current branch head.
- Focused auth security tests: TOTP brute force/replay, recovery-code replay, reset/verification token replay, tenant/session isolation.
- Execute queue benchmark on non-production hardware and record PostgreSQL CPU/IO/connection saturation.
- Sustained queue/backpressure and failure/recovery benchmarks.
- Validate 1,000,000 URLs/day only after measured end-to-end capacity; no such result exists yet.
- Real Google/Bing customer connections and end-to-end provider tests.
- Backup/restore drill.
- Production observability/alerting and security review.
- Production VPS deployment and HTTPS/DNS validation.
- HA/failover remains outside the single-VPS baseline.

## Immediate next step

Get CI running and green for the current branch. Fix any compile, migration or test failures first; then add/run focused authentication security tests. After those gates, execute the non-production queue benchmark and use measured results to size worker/database capacity. Do not use production credentials/data, merge into `main`, or deploy as part of this work.
