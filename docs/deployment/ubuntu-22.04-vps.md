# VPS deployment (Ubuntu 22.04)

## Prerequisites

- Docker Engine and Docker Compose plugin.
- A firewall allowing inbound 80/443 only; database, Redis, Kafka, ClickHouse and MinIO ports stay on loopback/internal Docker networks.
- DNS A/AAAA records for `index-assist.io.vn` pointed to the VPS.
- Target deployment: 32 vCPU, 64 GB RAM, 2 TB NVMe and 1 Gbps network. This is a capacity target for benchmark and tuning, not a verified one-million-URL/day throughput result. A single VPS is not high availability.

## First boot

1. Clone the repository and copy `.env.example` to `.env`, `.env.api.example` to `.env.api`, `.env.worker.example` to `.env.worker`, `.env.crawler.example` to `.env.crawler`, and `.env.provider-worker.example` to `.env.provider-worker`.
2. Generate independent secrets, e.g. `openssl rand -hex 32`, for the PostgreSQL bootstrap password, runtime DB password, relay DB password, Redis, ClickHouse, MinIO, JWT signing secret, OAUTH_STATE_SECRET and INTEGRATION_ENCRYPTION_KEY. Use a separate 32-byte hex encryption key and share that exact value between `.env.api` and `.env.provider-worker`. Set the same runtime password in `APP_DB_PASSWORD` and the password portion of `DATABASE_URL` and `PROVIDER_DATABASE_URL`.
3. Keep `MIGRATION_DATABASE_URL` only in the host-side `.env` file; the API and crawler env files contain only `index_assist_runtime`, while the relay env file contains only `index_assist_relay`, and the provider-worker env file uses the restricted `index_assist_runtime` role. Do not mount the root `.env` into app containers.
4. Register OAuth clients with Google and Microsoft/Bing and allow the exact callback URLs configured in `.env.api.example`: `/api/v1/integrations/google_search_console/callback` and `/api/v1/integrations/bing_webmaster/callback`. Use the production HTTPS origin; OAuth connections cannot be tested until DNS and TLS are live.
5. Start the infrastructure from the repository root:

   ```bash
   docker compose --env-file .env -f infra/docker/compose.infrastructure.yml up -d
   ```

6. Apply migrations as the database migration owner:

   ```bash
   bash infra/postgres/migrate.sh
   ```

7. Build and start the API, crawler, outbox relay and provider worker:

   ```bash
   docker compose --env-file .env -f infra/docker/compose.infrastructure.yml -f infra/docker/compose.workloads.yml up -d --build
   ```

8. Check `http://127.0.0.1:4000/api/v1/health/ready` locally and inspect container logs. The health route is unauthenticated; API business routes require a bearer token.

## Important first-install note

The PostgreSQL init script creates the non-superuser runtime role only when the data directory is initialized for the first time. If a persistent volume already exists, create the role and grants manually as the database administrator before starting API/worker containers. Updating the init script does not modify an existing database.

## Release constraints

This is a single-VPS baseline, not an HA deployment. Before public customer traffic, complete email verification, MFA, account recovery, Redis-backed distributed rate limiting, tenant RLS integration tests using the runtime role, authenticated Kafka/TLS and ACLs, crawler load/conformance testing, payment webhook idempotency, backup/restore drills, security review and load tests. Do not expose service ports directly to the internet.


The provider worker also requires the same INTEGRATION_ENCRYPTION_KEY and Google/Bing OAuth client credentials as the API, copied into .env.provider-worker. Configure exact provider callback URLs before enabling customer connections. The worker consumes the provider.jobs Kafka topic created by the infrastructure compose stack.


After registering the first trusted operator account, set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_ROLE in the host-side .env file and run `bash infra/postgres/bootstrap-platform-admin.sh` using the migration-owner connection. See docs/admin/platform-administration.md. Do not expose the admin hostname publicly until MFA/WebAuthn and account recovery controls are enabled.
