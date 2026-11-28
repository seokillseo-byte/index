#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
export MOCK_TOPICS="$TMP/topics"
export MOCK_USERS="$TMP/users"
export MOCK_ACLS="$TMP/acls"
: > "$MOCK_TOPICS"; : > "$MOCK_USERS"; : > "$MOCK_ACLS"

cat > "$TMP/bin/rpk" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2 $3" in
  "topic describe "*)
    grep -Fxq "$3" "$MOCK_TOPICS"
    ;;
  "topic create "*)
    printf '%s\n' "$3" >> "$MOCK_TOPICS"
    ;;
  "security user list")
    printf 'USER MECHANISM\n'
    cat "$MOCK_USERS"
    ;;
  "security user create")
    printf '%s\n' "$4" >> "$MOCK_USERS"
    ;;
  "security acl list")
    principal=''; resource_type=''; resource=''; operation=''
    while (($#)); do
      case "$1" in
        --allow-principal) principal="$2"; shift 2 ;;
        --topic) resource_type=topic; resource="$2"; shift 2 ;;
        --group) resource_type=group; resource="$2"; shift 2 ;;
        --cluster) resource_type=cluster; resource=kafka-cluster; shift ;;
        --operation) operation="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    grep -Fxq "$principal|$operation|$resource_type|$resource" "$MOCK_ACLS" && printf '%s\n' "$principal" || true
    ;;
  "security acl create")
    principal=''; resource_type=''; resource=''; operation=''
    while (($#)); do
      case "$1" in
        --allow-principal) principal="$2"; shift 2 ;;
        --topic) resource_type=topic; resource="$2"; shift 2 ;;
        --group) resource_type=group; resource="$2"; shift 2 ;;
        --cluster) resource_type=cluster; resource=kafka-cluster; shift ;;
        --operation) operation="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    printf '%s|%s|%s|%s\n' "$principal" "$operation" "$resource_type" "$resource" >> "$MOCK_ACLS"
    ;;
  *)
    echo "unexpected rpk command" >&2
    exit 2
    ;;
esac
MOCK
chmod +x "$TMP/bin/rpk"
export PATH="$TMP/bin:$PATH"
export RPK_BROKERS=redpanda:9092
export RPK_ADMIN_HOSTS=localhost:9644
export REQUIRE_KAFKA_TLS_SASL=true
export RPK_TLS_ENABLED=true
export RPK_ADMIN_TLS_ENABLED=true
export RPK_SASL_MECHANISM=SCRAM-SHA-512
export RPK_USER=index-assist-admin
export RPK_PASS=ephemeral-admin-password
export RPK_ADMIN_TLS_CA="$TMP/ca.crt"
export RPK_TLS_CA="$TMP/ca.crt"
printf 'mock-ca\n' > "$TMP/ca.crt"

for name in outbox crawler provider; do
  printf 'test-scram-password-for-%s-0123456789\n' "$name" > "$TMP/$name.pass"
done
export OUTBOX_PASSWORD_FILE="$TMP/outbox.pass"
export CRAWLER_PASSWORD_FILE="$TMP/crawler.pass"
export PROVIDER_PASSWORD_FILE="$TMP/provider.pass"

bash "$ROOT/infra/redpanda/provision-secure-cluster.sh"
[[ "$(wc -l < "$MOCK_TOPICS")" -eq 2 ]]
[[ "$(wc -l < "$MOCK_USERS")" -eq 3 ]]
[[ "$(wc -l < "$MOCK_ACLS")" -eq 11 ]]

# Re-running after a successful/partial provision does not duplicate users, topics or ACLs.
bash "$ROOT/infra/redpanda/provision-secure-cluster.sh"
[[ "$(wc -l < "$MOCK_TOPICS")" -eq 2 ]]
[[ "$(wc -l < "$MOCK_USERS")" -eq 3 ]]
[[ "$(wc -l < "$MOCK_ACLS")" -eq 11 ]]

if RPK_TLS_ENABLED=false bash "$ROOT/infra/redpanda/provision-secure-cluster.sh" >/dev/null 2>&1; then
  echo 'secure provisioning accepted plaintext Kafka' >&2
  exit 1
fi
echo 'Secure Redpanda provisioning mock tests passed'
