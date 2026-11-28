# Index Assist — Implementation Checklist

## Authentication hardening

- [x] Email verification tokens are single-use and expire after 30 minutes.
- [x] Registration sends verification email and does not issue sessions before verification.
- [x] Login and refresh require verified email.
- [x] Verification and resend endpoints are rate-limited.
- [x] TOTP MFA enrollment and login challenge.
- [x] Single-use MFA recovery codes hashed at rest.
- [x] Password recovery uses single-use 30-minute tokens and revokes existing sessions.
- [x] Server-side session listing and revocation endpoints.
- [x] MFA endpoint rate limits and DTO validation hardening.
- [x] MFA login challenge invalidated after five failed TOTP/recovery attempts.
- [x] MFA enrollment/disable and active challenge issuance serialized transactionally.
- [x] API service tests for MFA lockout and challenge-token hashing.
- [x] Database tests for auth-token replay, recovery-code replay, and tenant RLS.
- [x] Application tests for JWT session binding, tenant-switch rejection, and session ownership.
- [x] CI install/typecheck/build/Jest/worker syntax checks pass on commit `af3fc9c8b9f2375dd945266ac0ce86d1975f2d9b` (run #46101301044).
- [x] CI validation of the docs/status checkpoint passes on commit `ac3bb0968ce1bc097337cdf2f9b22241e3fce057` (run #46101487019).

## Provider Job Engine

- [x] Tenant-scoped provider job model and idempotency.
- [x] Verified property binding and URL coverage checks.
- [x] Google URL Inspection daily/minute quota reservation.
- [x] Bing live DailyQuota/MonthlyQuota checks.
- [x] Restricted runtime DB role for provider worker.
- [x] Kafka `provider.jobs` consumer and isolated worker.
- [x] Provider result persistence and acceptance/indexing distinction.
- [x] Retry/backoff, dead-letter, lease recovery and batch draining.
- [x] Provider job history, attempt tracking and indexes.
- [x] Runtime RLS claim and provider quota SQL tests.
- [x] CI database migrations and regression tests pass on both validation checkpoints above.

## Capacity and production readiness

- [x] Bounded non-production PostgreSQL queue benchmark harness and runbook.
- [ ] Execute benchmark on dedicated non-production database/hardware.
- [ ] Record queue latency, jobs/sec, DB CPU/IO, connections and saturation.
- [ ] Sustained queue/backpressure benchmark.
- [ ] Failure/recovery benchmark.
- [ ] Validate 1,000,000 URLs/day using measured end-to-end capacity.
- [ ] Google/Bing end-to-end test with non-production provider accounts.
- [ ] Backup/restore drill.
- [ ] Security review.
- [ ] Observability/alerting review.
- [ ] Production VPS deployment and HTTPS/DNS validation after release approval.

## Scope boundary

Google URL Inspection is inspection evidence, not an indexing request. Bing submission acceptance is not proof of indexing. No throughput target is considered achieved without measured evidence.
