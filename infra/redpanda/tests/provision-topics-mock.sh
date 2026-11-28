#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
export MOCK_TOPICS="$TMP/topics"
export MOCK_CALLS="$TMP/calls"
: > "$MOCK_TOPICS"
: > "$MOCK_CALLS"

cat > "$TMP/bin/rpk" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_CALLS"
case "$1 $2" in
  "topic describe")
    grep -Fxq "$3" "$MOCK_TOPICS"
    ;;
  "topic create")
    [[ -n "\${RPK_PASS:-}" ]] || [[ "\${REQUIRE_KAFKA_TLS_SASL:-false}" != true ]]
    printf '%s\n' "$3" >> "$MOCK_TOPICS"
    ;;
  *)
    echo "unexpected rpk command: $*" >&2
    exit 2
    ;;
esac
MOCK
chmod +x "$TMP/bin/rpk"
export PATH="$TMP/bin:$PATH"
export RPK_BROKERS=127.0.0.1:9092

# Development/plaintext mode preserves the existing local-only development workflow.
bash "$ROOT/infra/redpanda/provision-topics.sh"
[[ "$(sort "$MOCK_TOPICS" | tr '\n' ' ')" == "provider.jobs url.ingestion " ]]
first_create_count="$(grep -c '^topic create ' "$MOCK_CALLS")"
bash "$ROOT/infra/redpanda/provision-topics.sh"
[[ "$(grep -c '^topic create ' "$MOCK_CALLS")" == "$first_create_count" ]]

# Secured mode must fail closed unless TLS, SCRAM and a CA file are configured.
if REQUIRE_KAFKA_TLS_SASL=true bash "$ROOT/infra/redpanda/provision-topics.sh" >/dev/null 2>&1; then
  echo 'secure provisioning accepted missing TLS/SCRAM settings' >&2
  exit 1
fi
ca="$TMP/ca.crt"
printf 'test-ca\n' > "$ca"
export REQUIRE_KAFKA_TLS_SASL=true
export RPK_TLS_ENABLED=true
export RPK_SASL_MECHANISM=SCRAM-SHA-512
export RPK_USER=index-assist-admin
export RPK_PASS=ephemeral-test-password
export RPK_TLS_CA="$ca"
bash "$ROOT/infra/redpanda/provision-topics.sh"
echo 'Redpanda topic provisioning mock tests passed'
