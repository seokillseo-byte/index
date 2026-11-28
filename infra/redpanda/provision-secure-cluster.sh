#!/usr/bin/env sh
set -eu

: "${RPK_BROKERS:?RPK_BROKERS is required}"
: "${RPK_ADMIN_HOSTS:?RPK_ADMIN_HOSTS is required}"
[ "${REQUIRE_KAFKA_TLS_SASL:-false}" = "true" ] || { echo "Secure provisioning requires TLS/SASL mode" >&2; exit 1; }
[ "${RPK_TLS_ENABLED:-false}" = "true" ] || { echo "Kafka TLS must be enabled" >&2; exit 1; }
[ "${RPK_ADMIN_TLS_ENABLED:-false}" = "true" ] || { echo "Admin API TLS must be enabled" >&2; exit 1; }
[ "${RPK_SASL_MECHANISM:-}" = "SCRAM-SHA-512" ] || { echo "SCRAM-SHA-512 is required" >&2; exit 1; }
[ -n "${RPK_USER:-}" ] && [ -n "${RPK_PASS:-}" ] || { echo "Bootstrap admin SCRAM credentials are required" >&2; exit 1; }
[ -n "${RPK_TLS_CA:-}" ] && [ -r "$RPK_TLS_CA" ] && [ -s "$RPK_TLS_CA" ] || { echo "A readable Kafka CA certificate is required" >&2; exit 1; }
[ -n "${RPK_ADMIN_TLS_CA:-}" ] && [ -r "$RPK_ADMIN_TLS_CA" ] && [ -s "$RPK_ADMIN_TLS_CA" ] || { echo "A readable Admin API CA certificate is required" >&2; exit 1; }

ensure_topic() {
  topic="$1"
  partitions="$2"
  if rpk topic describe "$topic" >/dev/null 2>&1; then return 0; fi
  rpk topic create "$topic" --partitions "$partitions" --replicas 1
  rpk topic describe "$topic" >/dev/null
}

ensure_user() {
  username="$1"
  password_file="$2"
  if rpk security user list --format text | awk -v target="$username" '$1 == target { found=1 } END { exit !found }'; then
    echo "SCRAM principal already exists; keeping its current credential: $username"
    return 0
  fi
  [ -r "$password_file" ] && [ -s "$password_file" ] || { echo "Missing or unreadable SCRAM password file for $username" >&2; exit 1; }
  password="$(cat "$password_file")"
  [ "${#password}" -ge 32 ] || { echo "SCRAM password must be at least 32 characters for $username" >&2; exit 1; }
  rpk security user create "$username" --password "$password" --mechanism SCRAM-SHA-512
  unset password
}

ensure_acl() {
  principal="$1"
  operation="$2"
  resource_type="$3"
  resource="$4"
  case "$resource_type" in
    topic) existing="$(rpk security acl list --allow-principal "$principal" --topic "$resource" --operation "$operation" --format text)" ;;
    group) existing="$(rpk security acl list --allow-principal "$principal" --group "$resource" --operation "$operation" --format text)" ;;
    cluster) existing="$(rpk security acl list --allow-principal "$principal" --cluster --operation "$operation" --format text)" ;;
    *) echo "Unsupported ACL resource type: $resource_type" >&2; exit 1 ;;
  esac
  if printf '%s\n' "$existing" | grep -Fq "$principal"; then return 0; fi
  case "$resource_type" in
    topic) rpk security acl create --allow-principal "$principal" --operation "$operation" --topic "$resource" ;;
    group) rpk security acl create --allow-principal "$principal" --operation "$operation" --group "$resource" ;;
    cluster) rpk security acl create --allow-principal "$principal" --operation "$operation" --cluster ;;
  esac
}

ensure_topic url.ingestion 12
ensure_topic provider.jobs 6

ensure_user index-assist-outbox "${OUTBOX_PASSWORD_FILE:-/run/secrets/outbox-scram-password}"
ensure_user index-assist-crawler "${CRAWLER_PASSWORD_FILE:-/run/secrets/crawler-scram-password}"
ensure_user index-assist-provider "${PROVIDER_PASSWORD_FILE:-/run/secrets/provider-scram-password}"

ensure_acl User:index-assist-outbox write topic url.ingestion
ensure_acl User:index-assist-outbox describe topic url.ingestion
ensure_acl User:index-assist-outbox write topic provider.jobs
ensure_acl User:index-assist-outbox describe topic provider.jobs
ensure_acl User:index-assist-outbox idempotentwrite cluster kafka-cluster

ensure_acl User:index-assist-crawler read topic url.ingestion
ensure_acl User:index-assist-crawler describe topic url.ingestion
ensure_acl User:index-assist-crawler read group index-assist-crawler-v1

ensure_acl User:index-assist-provider read topic provider.jobs
ensure_acl User:index-assist-provider describe topic provider.jobs
ensure_acl User:index-assist-provider read group index-assist-provider-v1

echo "Secure Redpanda topics, SCRAM principals and least-privilege ACLs are provisioned"
