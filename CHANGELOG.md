## 2026-11-28 — Benchmark measurement coverage

- Extended the non-production provider queue benchmark output with queue-latency p50/p95/p99, PostgreSQL statistics counter deltas, and visible/benchmark connection counts.
- Clarified that host CPU and disk IO must still be collected from the non-production database host; database counters alone are not host utilization metrics.
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

