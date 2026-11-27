# Index Assist — Project Status

Updated: 2026-11-28

## Current implementation state

- Production target: SaaS, multi-tenant, Google + Bing provider integrations.
- Target VPS capacity: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps.
- Current repository baseline: `main` at `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Active branch head: `d995f6556901b8c48221dc62c446f09d48c0557f`.
- Draft review PR: #6, open and intentionally not merged.

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

Commit `d995f6556901b8c48221dc62c446f09d48c0557f` is the current branch head and includes the release bookkeeping documents.

GitHub Actions run `46047692879` completed successfully:
- Node typecheck/build: passed.
- Provider worker syntax check: passed.
- Go crawler race tests/vet: passed.
- PostgreSQL migrations and runtime RLS/provider-job/quota checks: passed.

## Production-readiness review findings

- Google URL Inspection limits are correctly aligned with Google's documented per-site limits of 2,000 QPD and 600 QPM.
- Bing's current JSON/HTTP API path remains the supported REST path; Microsoft's August 31, 2026 retirement applies to legacy SOAP/POX endpoints. The worker currently uses JSON/HTTP.
- Provider acceptance/inspection evidence must not be presented as proof of indexing.
- The remaining high-value engineering gate is capacity validation: benchmark queue throughput, database claim/update throughput, provider pacing, sustained backpressure and recovery behavior before claiming 1,000,000 URLs/day.

## Release gates still open

- Production VPS deployment.
- Production HTTPS/DNS validation.
- Real Google/Bing customer connections.
- End-to-end provider job test against real provider accounts.
- 1,000,000 URL/day benchmark.
- Sustained queue/backpressure benchmark.
- Backup/restore drill.
- Security review.
- Production observability/alerting review.
- HA/failover remains outside the single-VPS baseline.

## Immediate next step

Implement the non-production provider throughput benchmark and run it against a dedicated benchmark environment. Measure enqueue/claim/update throughput, queue latency, worker concurrency, database saturation and recovery behavior. Do not use production data or credentials, and do not merge or deploy as part of the benchmark work.
