# Provider Job Engine — Non-production benchmark

This benchmark measures only the PostgreSQL provider-queue claim/update path. It does **not** call Google/Bing and does not prove provider submission throughput or indexing throughput.

## Run

Use a dedicated benchmark PostgreSQL database with the normal migrations applied and an existing tenant/project/connection that can safely receive temporary benchmark jobs.

Required environment:

- `BENCHMARK_DATABASE_URL`
- `BENCHMARK_CONFIRM_NONPROD=YES`
- `BENCHMARK_TENANT_ID`
- `BENCHMARK_PROJECT_ID`
- `BENCHMARK_CONNECTION_ID`
- `BENCHMARK_SITE_URL`

Optional:

- `BENCHMARK_PROVIDER=bing_webmaster` (default) or `google_search_console`
- `BENCHMARK_JOBS=10000`
- `BENCHMARK_CONCURRENCY=8` (maximum 64)
- `BENCHMARK_BATCH_SIZE=100` (maximum 500)

Example:

```bash
BENCHMARK_DATABASE_URL='postgresql://...' \
BENCHMARK_CONFIRM_NONPROD=YES \
BENCHMARK_TENANT_ID='...' \
BENCHMARK_PROJECT_ID='...' \
BENCHMARK_CONNECTION_ID='...' \
BENCHMARK_SITE_URL='https://benchmark.example' \
BENCHMARK_JOBS=10000 \
BENCHMARK_CONCURRENCY=8 \
pnpm --filter @index-assist/worker benchmark:provider-jobs
```

## What it measures

- Seed duration (reported separately).
- Queue-drain jobs/sec and estimated jobs/day.
- Queue latency p50/p95/p99 from job creation to successful claim.
- Queue batch size and worker concurrency.
- PostgreSQL counter deltas during draining (transactions, buffer reads/hits, tuple writes, deadlocks and temp bytes).
- Visible database connections before/after the drain and benchmark pool connection count at report time.
- PostgreSQL host CPU, disk IO, memory and connection saturation (collect from the database host during the run; SQL statistics are not a substitute for OS-level metrics).

Each invocation creates a unique run ID and workers claim only that run's jobs. Cleanup is scoped to the same unique idempotency prefix and runs from a `finally` block, including when seeding or draining fails. Concurrent benchmark runs therefore do not clean up one another's rows.

The result is a database queue-path measurement only. Database counter deltas and visible connection counts are diagnostic context; collect OS-level CPU/disk IO and peak connection utilization separately from the database host. It must not be presented as proof that the system can submit or inspect 1,000,000 URLs/day through Google/Bing.

## Safety

Do not point `BENCHMARK_DATABASE_URL` at production. The script requires `BENCHMARK_CONFIRM_NONPROD=YES`, validates numeric limits, and deletes only rows created by its own invocation. Run against a disposable/non-production database and use a dedicated benchmark tenant/project/connection.

## Sustained load and backpressure protocol (not yet executed)

1. Capture a baseline with fixed job count, batch size and concurrency; record commit, PostgreSQL version/config and host CPU/memory/disk metrics.
2. Increase job volume in controlled steps while holding concurrency constant; vary concurrency separately.
3. Collect queue depth, oldest queued-job age, claim latency p50/p95/p99, jobs/sec, DB active/idle connections, CPU, memory, disk latency/IOPS, WAL generation and lock/deadlock counts.
4. Pause draining workers while adding jobs, then resume. Verify backlog drains without duplicate claims, cross-tenant access or unbounded connections.
5. Stop on saturation, lock waits, connection exhaustion, unexpected errors or host limits. Record safe operating points; do not extrapolate beyond measurements.

The current script is a bounded drain benchmark, not a sustained producer/consumer test. Do not mark this protocol complete until a controlled run and evidence exist.

## Failure and recovery protocol (not yet executed)

In isolated non-production, test worker termination after lease acquisition, restart, expired-lease recovery, transient provider failure, retry/backoff, max-attempt dead-letter and duplicate Kafka delivery. Verify terminal states, bounded retries, idempotency and tenant isolation. Record recovery time, duplicate side effects, queue depth and logs. Do not use customer credentials or production queues.
