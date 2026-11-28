# Index Assist — Implementation Checklist

## Authentication hardening

- [x] Email verification token storage added.
- [x] Verification tokens are single-use and expire after 30 minutes.
- [x] Registration sends transactional verification email and does not issue sessions before verification.
- [x] Login and refresh require a verified email address.
- [x] Verification and resend endpoints are rate-limited.
- [x] TOTP MFA enrollment and login challenge.
- [x] Single-use MFA recovery codes hashed at rest.
- [x] Password recovery with single-use 30-minute reset tokens.
- [x] Password reset revokes existing sessions.
- [x] Server-side session listing and revocation endpoints.
- [x] Rate limits applied to MFA login, recovery, enrollment verification and disable endpoints.
- [x] Corrected Unicode workspace-name and six-digit TOTP validation regexes.
- [x] MFA login challenge invalidated after five failed TOTP or recovery-code attempts.
- [x] Password-reset success response does not disclose the user identifier.
- [x] Migration 0019 and MFA lockout behavior covered by a CI database test.
- [x] Auth token replay regression covered by a CI database test.
- [x] MFA enrollment and single-active-challenge issuance serialized transactionally.

- [ ] Authentication CI/typecheck/test validation for the current branch head.
- [ ] Focused authentication security tests (TOTP replay/brute force, recovery-code replay, tenant/session isolation).

## Provider Job Engine

- [x] Provider job database model exists.
- [x] Provider jobs are tenant-scoped.
- [x] Verified property must be bound to project.
- [x] Submitted/inspected URLs are checked against the bound property.
- [x] Idempotency keys prevent duplicate reservations.
- [x] PostgreSQL advisory locking serializes quota reservations per property/window.
- [x] Google daily inspection reservation limit enforced.
- [x] Google per-minute inspection reservation limit enforced.
- [x] Bing live DailyQuota retrieved before submission reservation.
- [x] Bing live MonthlyQuota retrieved before submission reservation.
- [x] Provider worker uses restricted runtime DB role.
- [x] Provider worker consumes Kafka `provider.jobs`.
- [x] Google URL Inspection response persisted.
- [x] Bing submission acknowledgement persisted separately from indexing state.
- [x] Retry/backoff implemented.
- [x] Dead-letter state implemented.
- [x] Lease recovery implemented.
- [x] Batch draining implemented.
- [x] Per-property worker isolation implemented.
- [x] Attempt timestamp tracking implemented.
- [x] Provider job indexes added.
- [x] Runtime RLS claim test added.
- [x] Provider quota SQL test added.
- [ ] CI passes at latest checkpoint.

## Production-readiness review

- [x] Google URL Inspection quota values verified against current Google documentation.
- [x] Bing worker endpoint checked against current Bing API retirement guidance; JSON/HTTP is retained.
- [x] Provider acceptance is explicitly separated from indexing evidence.
- [x] Dedicated non-production provider queue benchmark harness added and hardened for isolated concurrent runs/cleanup.
- [ ] Benchmark run and capacity result.
- [ ] 1,000,000 URL/day benchmark.
- [ ] Sustained queue/backpressure benchmark.
- [ ] Recovery/failure benchmark.

## Release validation

- [ ] Production VPS deployment (release procedure documented).
- [ ] Production HTTPS/DNS validation.
- [ ] Google OAuth production connection test.
- [ ] Bing OAuth/API-key production connection test.
- [ ] End-to-end provider job test against real provider accounts.
- [ ] Backup/restore drill.
- [ ] Security review.
- [ ] Production observability/alerting review.

## Scope boundary

This checkpoint does not claim that Google or Bing indexes submitted URLs. Provider acceptance and Google inspection results are stored as evidence only.
