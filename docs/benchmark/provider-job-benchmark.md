# Provider Job Engine — Non-production benchmark

This benchmark is intentionally narrow. It measures only the PostgreSQL queue claim/update path used by the provider worker. It does **not** call Google/Bing and does not prove provider throughput or indexing throughput.

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
- `BENCHMARK_CONCURRENCY=8`
- `BENCHMARK_BATCH_SIZE=100`

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

## What to record

- jobs/sec
- estimated jobs/day
- queue batch size
- concurrency
- benchmark duration
- PostgreSQL CPU/IO/connection saturation

The result is a database queue-path measurement only. It must not be presented as proof that the system can submit or inspect 1,000,000 URLs/day through Google/Bing.

## Safety

Do not point `BENCHMARK_DATABASE_URL` at production. The script requires an explicit non-production confirmation and deletes only rows carrying its own `benchmark:` idempotency prefix.
