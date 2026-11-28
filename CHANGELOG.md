## 2026-11-28 — Backup tooling CI validation and failure cleanup

- CI run #46105828409 passed on `441df56070b520d65bdf7447b4e1e8260532fe23`; includes Bash syntax checks for backup and restore scripts, Node build/tests, Go race/vet and DB migrations/regressions.
- Hardened backup failure handling to remove partial artifacts unless the full archive/checksum/manifest validation succeeds.
- Added non-interactive PostgreSQL client flags to avoid hanging for password prompts; credentials must be supplied securely through approved environment/pgpass configuration.
- CI run #46105880673 passed on `c6171e948ba7e9d3487a4eb523c93535a487a330` across Node build/tests, Go race/vet, Bash syntax and database checks.
- The scripts are CI syntax-validated only; no real database backup or restore drill has been executed.

## 2026-11-28 — Backup/restore tooling and benchmark protocols

- Added PostgreSQL custom-format backup with restrictive permissions, archive listing validation, SHA-256 checksum and manifest.
- Added explicitly guarded non-production restore. It verifies checksum/archive and avoids destructive `--clean`/`--create` behavior.
- Added backup/restore drill runbook with post-restore schema, role, tenant-RLS, auth regression and app-connectivity checks. Actual restore remains unexecuted.
- Documented controlled sustained-load/backpressure and worker failure/recovery protocols; no benchmark is claimed as executed.
- Added CI shell syntax checks for operational scripts.

## 2026-11-28 — Provider quota decision tests

- Extracted the Google worker quota decision into a small side-effect-free helper and added Node tests for daily and rolling-minute limits, same-day retry prevention, and next-day eligibility.
- Added the worker package test script so recursive CI executes the new tests alongside API Jest tests.
- CI run #46103822023 passed on `f0b8ac2c8b837553a765e10ac1456ef52c3a7636`; Node typecheck/build/tests/worker syntax, Go race/vet and database migrations/security regressions all passed.

## 2026-11-28 — Verified property URL-prefix boundary

- Tightened URL-prefix property matching so `/blog` authorizes `/blog` and `/blog/...`, but not sibling paths such as `/blogger/...`.
- Added Jest regression tests for exact URL-prefix paths, child paths, sibling-prefix rejection, cross-origin rejection, and Search Console domain-property subdomains.
- CI run #46103551185 passed on `23808e3dc06c98bcb9c9538c856acb41521b7a55`; Node typecheck/build/Jest, provider-worker syntax, Go race/vet and database regression checks passed.
- This closes the identified URL-prefix matching issue; it does not replace the full security review release gate.

## 2026-11-28 — Google worker quota reservation hardening

- Added a PostgreSQL-serialized rolling 60-second Google URL Inspection attempt counter shared by all provider-worker instances for the same tenant/property.
- Added a worker-side daily attempt counter so execution limits are enforced independently of queue-admission pacing and per-process sleeps.
- Quota-deferred jobs are rescheduled to the next minute boundary or next UTC daily window without consuming an attempt.
- CI run #46103336063 passed on `b12727cc29bd4b1800b189ef33423cdc7f9f88bd` across Node install/typecheck/build/Jest/worker syntax, Go race tests/vet, ordered migrations and database security regression tests.
- No external provider calls or production benchmark were performed; real provider E2E remains outstanding.

## 2026-11-28 — Latest CI and release-status reconciliation

- Verified CI run #46102607623 on `0c50dc59380dabb99d597af5feabc17b641c8951`: Node install/typecheck/build/Jest and provider-worker/benchmark syntax checks, Go race tests/vet, ordered migrations, tenant RLS, MFA lockout, auth-token replay and MFA recovery-code replay all passed.
- Verified preceding CI run #46102488732 also passed.
- Updated project status and implementation checklist to reflect the latest passing validation; benchmark execution, provider-account E2E, backup/restore and review gates remain outstanding.
- No production benchmark, secret change, merge, deployment or destructive operation was performed.

## 2026-11-28 — Integration documentation consistency

- Removed stale API documentation statements claiming Google/Bing integrations and provider jobs were not yet connected, and clarified that real non-production provider-account E2E validation remains outstanding.
- Clarified that provider operations remain restricted to URLs covered by the project's bound verified property and that acknowledgements are not indexing proof.

## 2026-11-28 — Benchmark measurement coverage

- Extended the non-production provider queue benchmark output with queue-latency p50/p95/p99, PostgreSQL statistics counter deltas, and visible/benchmark connection counts.
- Clarified that host CPU and disk IO must still be collected from the non-production database host; database counters alone are not host utilization metrics.
- CI run #46102361891 passed on commit `67f8447801b8837550fcdba607f09932be82eb29` across Node typecheck/build/Jest/worker syntax checks, Go race tests/vet, and database migration/RLS/auth regression checks.
- No benchmark was executed and no throughput claim was added.

## 2026-11-28 — CI activation and validation

- Added push-triggered CI for `feature/provider-job-engine`, ensuring branch commits run the same validation jobs rather than relying solely on pull-request events.
- CI run #46101301044 passed on `af3fc9c8b9f2375dd945266ac0ce86d1975f2d9b`: Node install/typecheck/build/Jest/worker syntax checks, Go crawler tests with race detector and vet, ordered database migrations, tenant RLS, MFA lockout, auth-token replay, and MFA recovery-code replay.
- Documentation/status checkpoint commit `ac3bb0968ce1bc097337cdf2f9b22241e3fce057` also passed CI run #46101487019 across all three jobs.
- No benchmark execution, production credential use, production deployment, main merge, or destructive operation was performed.

## 2026-11-28 — Authentication challenge hardening

- Added a persistent failed-attempt counter to auth tokens and invalidate MFA login challenges after five invalid TOTP or recovery-code attempts.
- Password-reset success responses no longer disclose the internal user ID.
- Added migration `0019_mfa_challenge_attempt_limits.sql`.
- Added CI database coverage for MFA lockout, consumed authentication-token replay, and single-use MFA recovery-code replay.
- Added API Jest/ts-jest infrastructure and service-level MFA challenge lockout/token-hashing coverage.
- Added application-level tenant/session isolation tests for JWT session binding, tenant switching and session ownership.
- Hardened MFA disable and serialized MFA enrollment/active challenge issuance with transactional row locking.
- Documented Git-based release/VPS deployment, configuration separation and rollback boundaries.

## 2026-11-28 — Provider Job Engine and benchmark harness

- Added provider-job attempt tracking and indexes, runtime RLS/quota regression coverage, and the isolated provider worker.
- Added a bounded non-production PostgreSQL queue benchmark harness and runbook. It measures only database queue-path throughput, not Google/Bing submission throughput.
- Google URL Inspection remains bounded by configured per-site daily/minute limits; Bing remains bounded by live provider quota.
- Provider acceptance and inspection evidence are not presented as proof of indexing.

