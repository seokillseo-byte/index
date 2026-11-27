# Index Assist — Implementation Checklist

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
- [x] CI passes at latest checkpoint.

## Production-readiness review

- [x] Google URL Inspection quota values verified against current Google documentation.
- [x] Bing worker endpoint checked against current Bing API retirement guidance; JSON/HTTP is retained.
- [x] Provider acceptance is explicitly separated from indexing evidence.
- [ ] Dedicated provider throughput benchmark harness.
- [ ] 1,000,000 URL/day benchmark.
- [ ] Sustained queue/backpressure benchmark.
- [ ] Recovery/failure benchmark.

## Release validation

- [ ] Production VPS deployment.
- [ ] Production HTTPS/DNS validation.
- [ ] Google OAuth production connection test.
- [ ] Bing OAuth/API-key production connection test.
- [ ] End-to-end provider job test against real provider accounts.
- [ ] Backup/restore drill.
- [ ] Security review.
- [ ] Production observability/alerting review.

## Scope boundary

This checkpoint does not claim that Google or Bing indexes submitted URLs. Provider acceptance and Google inspection results are stored as evidence only.
