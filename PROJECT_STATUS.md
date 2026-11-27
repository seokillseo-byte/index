# Index Assist — Project Status

Updated: 2026-11-28

## Current implementation state

- Production target: SaaS, multi-tenant, Google + Bing provider integrations.
- Target VPS capacity: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps.
- Current repository baseline: `main` at `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Active branch head: `7d7b46fb49db02762b9347d729d3e6ea2963249f`.
- Review PR: #6, open and ready for review; intentionally not merged.

## Authentication hardening completed in this checkpoint

- Email verification token storage and single-use 30-minute expiry.
- Transactional verification email delivery through Resend REST API.
- Registration no longer issues access/refresh sessions before email verification.
- Login and refresh reject unverified accounts.
- Verification and resend endpoints are rate-limited.
- TOTP MFA enrollment, verification and MFA-gated login are implemented.
- One-time MFA recovery codes are generated and stored only as hashes.
- Password recovery uses single-use 30-minute reset tokens and revokes existing sessions after reset.
- Server-side session listing, individual revocation and revoke-all controls are implemented.

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

The current branch head is `7d7b46fb49db02762b9347d729d3e6ea2963249f` and includes the authentication hardening checkpoint plus MFA challenge hardening.

Previous GitHub Actions run `46047692879` completed successfully for the provider-engine checkpoint. A new CI run for the current authentication changes is still required before this checkpoint can be marked validated.

## Production-readiness review findings

- Google URL Inspection limits are correctly aligned with Google's documented per-site limits of 2,000 QPD and 600 QPM.
- Bing's current JSON/HTTP API path remains the supported REST path; Microsoft's August 31, 2026 retirement applies to legacy SOAP/POX endpoints. The worker currently uses JSON/HTTP.
- Provider acceptance/inspection evidence must not be presented as proof of indexing.
- The remaining high-value engineering gates are authentication completion (MFA/recovery/session management) and capacity validation: benchmark queue throughput, database claim/update throughput, provider pacing, sustained backpressure and recovery behavior before claiming 1,000,000 URLs/day.

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

Run CI/typecheck/tests for the authentication checkpoint. If green, perform a focused auth security review and then run the dedicated non-production provider throughput benchmark. Do not use production data or credentials, and do not merge or deploy as part of benchmark work.
