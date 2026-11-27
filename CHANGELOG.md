## 2026-11-28

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
