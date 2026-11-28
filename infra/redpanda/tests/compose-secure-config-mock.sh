#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
SECRETS="$ROOT/secrets"
cleanup() {
  rm -rf "$TMP"
  rm -rf "$SECRETS"
}
trap cleanup EXIT
if [[ -e "$SECRETS" ]]; then
  echo "Refusing to replace an existing secrets directory" >&2
  exit 1
fi
mkdir -p "$SECRETS/kafka" "$SECRETS/redpanda"
for file in \
  "$SECRETS/kafka/ca.crt" \
  "$SECRETS/kafka/outbox-scram-password" \
  "$SECRETS/kafka/crawler-scram-password" \
  "$SECRETS/kafka/provider-scram-password" \
  "$SECRETS/redpanda/broker.crt" \
  "$SECRETS/redpanda/broker.key" \
  "$SECRETS/redpanda/admin.crt" \
  "$SECRETS/redpanda/admin.key" \
  "$SECRETS/redpanda/admin-password"; do
  printf 'ephemeral-ci-placeholder\n' > "$file"
done
chmod 600 "$SECRETS"/kafka/* "$SECRETS"/redpanda/*
cat > "$TMP/infrastructure.env" <<'ENV'
POSTGRES_PASSWORD=ci-postgres-password
APP_DB_PASSWORD=ci-runtime-password
REDIS_PASSWORD=ci-redis-password
CLICKHOUSE_PASSWORD=ci-clickhouse-password
MINIO_ROOT_USER=ci-minio-user
MINIO_ROOT_PASSWORD=ci-minio-password
ENV
cat > "$TMP/redpanda.env" <<'ENV'
REDPANDA_ADMIN_USER=index-assist-admin
REDPANDA_BOOTSTRAP_ONCE=1
ENV

cd "$ROOT"
docker compose --env-file "$TMP/infrastructure.env" --env-file "$TMP/redpanda.env" \
  -f infra/docker/compose.infrastructure.yml \
  -f infra/docker/compose.redpanda.secure.yml config --quiet
echo 'Secure Redpanda Compose merge validation passed'
