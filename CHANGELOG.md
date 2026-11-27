# Changelog

## 2026-11-28

### Provider Job Engine — quota hardening

- Added `last_attempt_at` tracking for provider jobs.
- Added provider-job indexes for queue claims, expired leases, quota queries and history.
- Added runtime RLS test coverage for provider-job claiming.
- Added provider quota count assertion and PostgreSQL advisory-lock serialization check.
- Kept Google URL Inspection bounded by the documented 2,000/day and 600/minute limits configured for the application.
- Kept Bing submissions bounded by live DailyQuota/MonthlyQuota returned by the provider.
- Verified the latest branch checkpoint with GitHub Actions: Node, Go and PostgreSQL checks passed.

### Release note

No production deployment, secret rotation, or main-branch merge was performed in this checkpoint.
