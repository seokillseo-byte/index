# Index Assist — Observability and alerting review

Updated: 2026-11-28
Branch reviewed: `feature/provider-job-engine` after Redis and Kafka client-security changes (fresh CI pending)

## Scope

CI checkpoint update: run #184 passed on `1a9be1d87fa541866777475f28d0a6c3fe682bb4`; this does not provide live metrics, alert delivery evidence, or production monitoring.

Static review of repository configuration and application/worker health/logging surfaces. No running VPS, metrics backend, alert receiver or production logs were available. This is a gap assessment, not a live observability validation.

## Current baseline

- API has a readiness endpoint used by the Compose health check; it now reports not-ready when PostgreSQL or shared Redis is unavailable.
- Crawler has a readiness endpoint used by its Compose health check.
- API and workers emit process logs; provider worker records provider/queue errors to standard output/error.
- API rate-limited requests depend on shared Redis; the current adapter fails closed with HTTP 503 when Redis is unavailable. Redis availability/error-rate and memory-pressure alerting (the service uses `noeviction`) plus deployed multi-instance outage drills remain outstanding. The repository now includes a Redis integration test with two independent storage instances; CI validation is pending. Kafka client TLS/SCRAM support and ACL rollout guidance are now present, but the active broker remains plaintext until non-production provisioning and negative ACL tests pass.
- Provider queue state and attempt/error fields are persisted in PostgreSQL.
- Benchmark harness reports queue-path throughput/latency, PostgreSQL counter deltas and connection snapshots.
- No metrics scraper, dashboard, distributed tracing collector, log aggregation configuration, alert rules or notification integration was found in the repository tree.

## Required operational signals

| Area | Signals to collect | Alert condition to define |
|---|---|---|
| API | request rate, p50/p95/p99 latency, 4xx/5xx, process restarts | sustained 5xx, latency or restart spike |
| Authentication | login failures, MFA failures/lockouts, password-reset and verification abuse, throttling | unusual failure/abuse rate |
| PostgreSQL | active/idle/max connections, CPU, memory, disk latency/IOPS, storage, locks/deadlocks, WAL, replication/backup status | connection exhaustion, storage pressure, lock/deadlock spike, backup stale |
| Kafka/Redpanda | broker health, consumer lag, under-replicated partitions, unavailable partitions | sustained lag or broker/partition failure |
| Outbox/crawler | pending outbox count/age, ingestion queue depth, crawler failures and retry count | oldest pending event or backlog exceeds agreed SLO |
| Provider worker | queued/retrying/leased/dead-letter counts, oldest queued age, lease recovery, attempt rate, quota deferrals, provider auth/API errors | dead-letter increase, stuck leases, backlog age, quota/provider failure |
| Backup/restore | last successful backup, checksum/archive verification, off-site copy status, last restore drill | missed backup, verification/copy/restore failure |
| Host | CPU, memory, disk space/latency, network, container restarts | sustained saturation or disk exhaustion |

## Release requirements

- Select and document the metrics/logging/tracing stack already approved for operations; do not treat health endpoints as full monitoring.
- Define service-level thresholds and notification ownership before enabling customer traffic.
- Ensure logs do not contain access/refresh tokens, OAuth secrets, API keys, passwords, full database URLs or unredacted sensitive provider payloads.
- Restrict access and retention for authentication, tenant and provider operational logs.
- Test alert delivery and runbooks with controlled non-production failures.
- Capture host CPU/disk IO separately during queue benchmarks; PostgreSQL statistics alone are not host utilization.

## Decision

**Observability/alerting review remains open.** This review records the missing operational coverage and required signals; it does not claim monitoring has been deployed or alerts have been tested.
