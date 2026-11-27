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
- Queue batch size and worker concurrency.
- PostgreSQL CPU/IO/connection saturation (collect from the database host during the run).

Each invocation creates a unique run ID and workers claim only that run's jobs. Cleanup is scoped to the same unique idempotency prefix and runs from a `finally` block, including when seeding or draining fails. Concurrent benchmark runs therefore do not clean up one another's rows.

The result is a database queue-path measurement only. It must not be presented as proof that the system can submit or inspect 1,000,000 URLs/day through Google/Bing.

## Safety

Do not point `BENCHMARK_DATABASE_URL` at production. The script requires `BENCHMARK_CONFIRM_NONPROD=YES`, validates numeric limits, and deletes only rows created by its own invocation. Run against a disposable/non-production database and use a dedicated benchmark tenant/project/connection.
