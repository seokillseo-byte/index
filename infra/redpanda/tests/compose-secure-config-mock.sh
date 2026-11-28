#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
SECRETS="$ROOT/secrets"
CREATED_SECRETS=0
cleanup() {
  rm -rf "$TMP"
  if [[ "$CREATED_SECRETS" == 1 ]]; then rm -rf "$SECRETS"; fi
}
trap cleanup EXIT
if [[ -e "$SECRETS" ]]; then
  echo "Refusing to replace an existing secrets directory" >&2
  exit 1
fi
mkdir -p "$SECRETS/kafka" "$SECRETS/redpanda"
CREATED_SECRETS=1
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
grep -Fq 'export RPK_PASS="$$(cat /run/secrets/redpanda-admin-password)"' infra/docker/compose.redpanda.secure.yml || { echo "Provisioner password command must defer expansion to the container shell" >&2; exit 1; }
# YAML parsing alone cannot detect a missing security-critical broker setting.
ruby -e 'require "yaml"; c=YAML.load_file("infra/redpanda/redpanda.yaml.example").fetch("redpanda"); abort "enable_sasl must be true" unless c["enable_sasl"] == true; abort "Kafka listener must require SASL" unless c.fetch("kafka_api").any? { |x| x["authentication_method"] == "sasl" }; abort "Kafka ACL authorization must be enabled" unless c["kafka_enable_authorization"] == true; abort "Kafka TLS must be enabled" unless c.fetch("kafka_api_tls").any? { |x| x["name"] == "internal" && x["enabled"] == true }; abort "Admin API must bind loopback" unless c.fetch("admin").any? { |x| x["address"] == "127.0.0.1" }; abort "Admin API TLS must be enabled" unless c.fetch("admin_api_tls").any? { |x| x["name"] == "admin" && x["enabled"] == true }'
docker compose --env-file "$TMP/infrastructure.env" --env-file "$TMP/redpanda.env" \
  -f infra/docker/compose.infrastructure.yml \
  -f infra/docker/compose.redpanda.secure.yml config > "$TMP/compose.merged.yml"
ruby -e '
  require "yaml"
  config = YAML.load_file(ARGV.fetch(0))
  services = config.fetch("services")
  broker = services.fetch("redpanda")
  init = services.fetch("redpanda-init")
  abort "secure overlay must pin broker v26.3.1" unless broker.fetch("image") == "redpandadata/redpanda:v26.3.1"
  abort "provisioner must use the same pinned broker image" unless init.fetch("image") == "redpandadata/redpanda:v26.3.1"
  abort "provisioner must share broker network namespace for loopback Admin API" unless init["network_mode"] == "service:redpanda"
  dependency = init.fetch("depends_on").fetch("redpanda")
  abort "provisioner must wait for authenticated broker health" unless dependency["condition"] == "service_healthy"
  secure_volume = broker.fetch("volumes").any? { |volume| volume["source"] == "redpanda_data_secure" && volume["target"] == "/var/lib/redpanda/data" }
  abort "secure overlay must use its isolated data volume" unless secure_volume
  abort "secure overlay must not mount the legacy broker volume" if broker.fetch("volumes").any? { |volume| volume["source"] == "redpanda_data" }
  abort "Admin API port must not be published" if broker.fetch("ports", []).any? { |port| port["target"] == 9644 }
'
echo 'Secure Redpanda Compose merge and runtime topology validation passed'
