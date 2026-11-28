## 2026-11-28

### Authentication challenge hardening

- Added a persistent failed-attempt counter to auth tokens and invalidate MFA login challenges after five invalid TOTP or recovery-code attempts.
- Password-reset success responses no longer disclose the internal user ID.
- Added migration `0019_mfa_challenge_attempt_limits.sql`.
- Added a CI database test for five-failure MFA challenge lockout semantics.
- Added a CI database test for consumed authentication-token replay.
- Added API Jest/ts-jest infrastructure and service-level MFA challenge lockout/token-hashing coverage.
- Added a CI database test for single-use MFA recovery-code replay.
- Added application-level tenant/session isolation tests for JWT session binding, tenant switching and session ownership.
- Hardened MFA disable with transactional row locking and a second MFA-state/credential check before disabling.
- Serialized MFA enrollment and single-active password-reset/MFA-login challenge issuance with transactional row locking.
- Documented the Git-based release/VPS deployment procedure and configuration/rollback boundaries.

### Authentication validation hardening

- Corrected Unicode property and six-digit TOTP validation patterns in DTO validators.
- Tightened rate limits for MFA login, recovery, enrollment verification and MFA disable endpoints.
- Corrected the registration API documentation: sessions are issued only after email verification.

### Benchmark harness hardening

- Fixed the benchmark worker claim path to use a unique worker lease owner.
- Isolated each benchmark run with a unique idempotency prefix so concurrent runs cannot claim or delete each other's jobs.
- Added bounded integer validation for job count, concurrency and batch size.
- Added guaranteed run-scoped cleanup in a `finally` block.
- Separated seed duration from queue-drain throughput metrics.
- Clarified that benchmark output measures PostgreSQL queue-path throughput only, not Google/Bing provider throughput.

### Authentication — MFA, recovery and sessions

- Added encrypted TOTP MFA enrollment and MFA-gated login.
- Added single-use MFA recovery codes stored only as SHA-256 hashes.
- Added password-reset request and reset flows with 30-minute single-use tokens.
- Password reset and MFA disable revoke existing sessions.
- Added server-side session listing, individual revocation and revoke-all controls.
- Hardened MFA and password-reset challenge issuance so only one active challenge of each relevant type exists.
- Added migration `0018_auth_mfa_recovery.sql`.

### Authentication — email verification

- Added single-use email verification tokens with 30-minute expiry.
- Added transactional verification email delivery via Resend REST API.
- Registration no longer issues access/refresh sessions before email verification.
- Login and refresh now require a verified email address.
- Added rate-limited email verification and resend endpoints.
- Documented RESEND_API_KEY and EMAIL_FROM configuration.

# Changelog

## 2026-11-28

### Provider Job Engine — quota hardening and release review

- Added `last_attempt_at` tracking for provider jobs.
- Added provider-job indexes for queue claims, expired leases, quota queries and history.
- Added runtime RLS test coverage for provider-job claiming.
- Added provider quota count assertion and PostgreSQL advisory-lock serialization check.
- Kept Google URL Inspection bounded by the documented 2,000/day and 600/minute per-site limits.
- Kept Bing submissions bounded by live DailyQuota/MonthlyQuota returned by the provider.
- Confirmed the worker uses Bing's JSON/HTTP API path; the August 31, 2026 retirement notice applies to legacy SOAP/POX endpoints.
- Reconciled project status/checklist with the current branch head `d995f6556901b8c48221dc62c446f09d48c0557f`.
- Marked PR #6 ready for review and recorded the release-readiness review.
- Added a bounded non-production PostgreSQL provider queue benchmark harness and runbook; it does not call Google/Bing or claim provider throughput.

### Release note

No production deployment, secret rotation, destructive data operation, or main-branch merge was performed in this checkpoint.
