# VPS deployment (Ubuntu 22.04)

## Prerequisites

- Docker Engine and Docker Compose plugin.
- A firewall allowing inbound 80/443 only; database, Redis, Kafka, ClickHouse and MinIO ports stay on loopback/internal Docker networks.
- DNS A/AAAA records for `index-assist.io.vn` pointed to the VPS.
- At least 16 GB RAM for a single-node all-in-one evaluation deployment; 32-64 GB RAM and 16-32 vCPU are a more realistic starting point for sustained high-throughput ingestion. A single VPS is not high availability.

## First boot

1. Clone the repository and copy `.env.example` to `.env`.
2. Generate independent secrets, e.g. `openssl rand -hex 32`, for the PostgreSQL bootstrap password, runtime DB password, Redis, ClickHouse, MinIO and JWT signing secret. Set the same runtime password in `APP_DB_PASSWORD` and the password portion of `DATABASE_URL`.
3. Keep `MIGRATION_DATABASE_URL` restricted to the migration operator; the API and worker must use `index_assist_runtime`.
4. Start the infrastructure from the repository root:

   ```bash
   docker compose --env-file .env -f infra/docker/compose.infrastructure.yml up -d
   ```

5. Apply migrations as the database migration owner:

   ```bash
   bash infra/postgres/migrate.sh
   ```

6. Build and start the API and outbox relay:

   ```bash
   docker compose --env-file .env -f infra/docker/compose.infrastructure.yml -f infra/docker/compose.workloads.yml up -d --build
   ```

7. Check `http://127.0.0.1:4000/api/v1/health/ready` locally and inspect container logs. The health route is unauthenticated; API business routes require a bearer token.

## Important first-install note

The PostgreSQL init script creates the non-superuser runtime role only when the data directory is initialized for the first time. If a persistent volume already exists, create the role and grants manually as the database administrator before starting API/worker containers. Updating the init script does not modify an existing database.

## Release constraints

This is a single-VPS baseline, not an HA deployment. Before public customer traffic, complete email verification, MFA, account recovery, Redis-backed distributed rate limiting, tenant RLS integration tests using the runtime role, authenticated Kafka/TLS and ACLs, crawler consumer implementation, payment webhook idempotency, backup/restore drills, security review and load tests. Do not expose service ports directly to the internet.
