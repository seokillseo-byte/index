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
- [x] CI run #46102488732 passes on `8ee786ce6fec4448db0f5755b602345aeaefb39e`.
- [x] CI run #46102607623 passes on `0c50dc59380dabb99d597af5feabc17b641c8951`, including Node/Jest, worker syntax, Go race/vet and database security regressions.
- [x] CI run #46103232631 passes on `aca15d51d989d782e76f4fa4a9d433dfa2f998ec`.
- [x] CI run #46103336063 passes on `b12727cc29bd4b1800b189ef33423cdc7f9f88bd` after shared Google per-minute worker quota hardening.
- [x] CI run #46103551185 passes on `23808e3dc06c98bcb9c9538c856acb41521b7a55`, including new verified-property URL-scope regression tests.
- [x] CI run #46103822023 passes on `f0b8ac2c8b837553a765e10ac1456ef52c3a7636`, including provider quota-decision unit tests.

## Provider Job Engine

- [x] Tenant-scoped provider job model and idempotency.
- [x] Verified property binding and URL coverage checks, including URL-prefix path-segment boundary validation.
- [x] Google URL Inspection daily/minute quota reservation at API admission.
- [x] Google URL Inspection per-minute attempt reservation shared across worker instances.
- [x] Worker quota-decision unit tests cover daily cap, rolling-minute cap, same-day retry prevention and next-day eligibility.
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
- [x] Benchmark reports queue-latency percentiles, PostgreSQL counter deltas and connection snapshots; host CPU/disk IO are measured separately at host level.
- [x] CI validates benchmark metric instrumentation and all existing checks on commit `67f8447801b8837550fcdba607f09932be82eb29` (run #46102361891).
- [ ] Execute benchmark on dedicated non-production database/hardware.
- [ ] Record queue latency, jobs/sec, DB CPU/IO, connections and saturation.
- [x] Document controlled sustained queue/backpressure benchmark protocol.
- [ ] Execute sustained queue/backpressure benchmark and record metrics.
- [x] Document non-production worker failure/recovery protocol.
- [ ] Execute worker failure/recovery tests and record evidence.
- [ ] Validate 1,000,000 URLs/day using measured end-to-end capacity.
- [ ] Google/Bing end-to-end test with non-production provider accounts.
- [x] Add guarded PostgreSQL custom-format backup and non-production restore scripts with checksum/archive validation.
- [x] Encrypt backup artifacts with age before final storage; restore decrypts only into a private temporary directory and requires an external identity file.
- [x] Remove partial backup artifacts on failure and prevent interactive password prompts in unattended operations.
- [x] CI validates Bash syntax and runs mocked backup/restore safety tests, including temporary plaintext cleanup, restore guard and tamper rejection.
- [x] Document post-restore validation and operational limitations.
- [ ] Configure protected age identity storage/key recovery and off-site encrypted backup replication.
- [ ] Execute non-production restore drill and record evidence.
- [x] Perform preliminary static security/configuration review and document findings.
- [ ] Resolve security release findings: shared Redis throttling, Kafka TLS/auth/ACL, encrypted/off-host backup policy, database TLS for multi-host, and independent security review.
- [x] Perform observability/alerting gap assessment and document required signals.
- [ ] Deploy metrics/logging/alerting, define thresholds/owners, and test alert delivery in non-production.
- [ ] Production VPS deployment and HTTPS/DNS validation after release approval.

## Scope boundary

Google URL Inspection is inspection evidence, not an indexing request. Bing submission acceptance is not proof of indexing. No throughput target is considered achieved without measured evidence.
