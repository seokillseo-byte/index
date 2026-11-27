# Index Assist — Project Status

Updated: 2026-11-28

## Current implementation state

- Production target: SaaS, multi-tenant, Google + Bing provider integrations.
- Target VPS capacity: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps.
- Current repository baseline: `main` at `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Active branch head: `ed92a1a043658ae6b497aae367fc5b76abc1c211`.
- Provider Job Engine PR #5 was merged previously; this branch contains subsequent provider quota hardening commits and is intentionally not merged again in this session.

## Completed before this checkpoint

- Tenant-aware project and backlink verification modules.
- Google Search Console and Bing Webmaster OAuth integrations.
- Encrypted provider credentials with AES-256-GCM.
- Verified-property binding and URL coverage checks.
- Provider job persistence and transactional outbox.
- Kafka `provider.jobs` topic and isolated provider worker.
- Google URL Inspection queue with property-scoped daily/minute reservation controls.
- Bing URL submission queue with live DailyQuota/MonthlyQuota checks.
- Retry/backoff, dead-letter handling, lease recovery and batch draining.
- Provider job history API.
- Attempt timestamp tracking and provider-job indexes.
- Runtime tenant RLS/provider-job claim and quota SQL checks.

## Latest verified checkpoint

Commit `ed92a1a043658ae6b497aae367fc5b76abc1c211` adds database assertions for provider quota counting and advisory-lock serialization.

GitHub Actions run `46047692879` completed successfully:
- Node typecheck/build: passed.
- Provider worker syntax check: passed.
- Go crawler race tests/vet: passed.
- PostgreSQL migrations and runtime RLS/provider-job/quota checks: passed.

## Release gates still open

- VPS deployment has not been performed in this session.
- Production OAuth credentials/secrets have not been changed.
- Real Google/Bing customer connections have not been exercised against production accounts.
- One-million-URL/day benchmark and sustained load test are not yet proven.
- HA/failover is not provided by the single-VPS baseline.
- Security review, backup/restore drill, payment webhook idempotency, email/MFA/account recovery and distributed rate-limit release gates remain.

## Immediate next step

Finish provider-job branch bookkeeping and review the quota/worker changes as a release candidate. Then create a review PR to `main`; do not merge or deploy without explicit approval.
