#!/usr/bin/env sh
set -eu

: "\${RPK_BROKERS:?RPK_BROKERS is required}"

if [ "\${REQUIRE_KAFKA_TLS_SASL:-false}" = "true" ]; then
  [ "\${RPK_TLS_ENABLED:-false}" = "true" ] || { echo "Kafka TLS must be enabled" >&2; exit 1; }
  [ "\${RPK_SASL_MECHANISM:-}" = "SCRAM-SHA-512" ] || { echo "SCRAM-SHA-512 is required" >&2; exit 1; }
  [ -n "\${RPK_USER:-}" ] && [ -n "\${RPK_PASS:-}" ] || { echo "Kafka admin SCRAM credentials are required" >&2; exit 1; }
  [ -n "\${RPK_TLS_CA:-}" ] && [ -s "$RPK_TLS_CA" ] || { echo "A readable Kafka CA certificate is required" >&2; exit 1; }
fi

ensure_topic() {
  topic="$1"
  partitions="$2"
  if rpk topic describe "$topic" >/dev/null 2>&1; then
    return 0
  fi
  rpk topic create "$topic" --partitions "$partitions" --replicas 1
  rpk topic describe "$topic" >/dev/null
}

ensure_topic url.ingestion 12
ensure_topic provider.jobs 6
