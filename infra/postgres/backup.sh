#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL}"
: "${BACKUP_OUTPUT_DIR:?Set BACKUP_OUTPUT_DIR}"
recipient_csv="${BACKUP_AGE_RECIPIENTS:-${BACKUP_AGE_RECIPIENT:-}}"
: "${recipient_csv:?Set BACKUP_AGE_RECIPIENTS (comma-separated age recipients) or BACKUP_AGE_RECIPIENT}"
[[ "$recipient_csv" != ,* && "$recipient_csv" != *, && "$recipient_csv" != *,,* ]] || { echo "Empty age recipient entry" >&2; exit 1; }
IFS=',' read -r -a recipients <<< "$recipient_csv"
(("${#recipients[@]}" > 0)) || { echo "At least one age recipient is required" >&2; exit 1; }
age_recipient_args=()
declare -A seen_recipients=()
for recipient in "${recipients[@]}"; do
  [[ "$recipient" =~ ^age1[023456789acdefghjklmnpqrstuvwxyz]{20,}$ ]] || { echo "Invalid age X25519 recipient format" >&2; exit 1; }
  [[ -z "${seen_recipients[$recipient]+x}" ]] || { echo "Duplicate age recipient" >&2; exit 1; }
  seen_recipients["$recipient"]=1
  age_recipient_args+=(--recipient "$recipient")
done
command -v psql >/dev/null
command -v pg_dump >/dev/null
command -v pg_restore >/dev/null
command -v age >/dev/null
command -v sha256sum >/dev/null
umask 077
mkdir -p "$BACKUP_OUTPUT_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_name="$(psql -w "$BACKUP_DATABASE_URL" -Atqc 'SELECT current_database()')"
safe_name="$(printf '%s' "$database_name" | tr -c 'A-Za-z0-9_.-' '_')"
base="index-assist-${safe_name}-${timestamp}-$$"
encrypted="$BACKUP_OUTPUT_DIR/$base.dump.age"
manifest="$BACKUP_OUTPUT_DIR/$base.manifest"
checksum="$encrypted.sha256"
for path in "$encrypted" "$manifest" "$checksum"; do [[ ! -e "$path" ]] || { echo "Refusing to overwrite $path" >&2; exit 1; }; done
workdir="$(mktemp -d "${TMPDIR:-/tmp}/index-assist-backup.XXXXXX")"
plain="$workdir/$base.dump"
completed=0
cleanup() {
  rm -rf "$workdir"
  if [[ "$completed" != 1 ]]; then rm -f "$encrypted" "$checksum" "$manifest"; fi
}
trap cleanup EXIT
pg_dump --no-password --format=custom --no-owner --no-acl --file "$plain" "$BACKUP_DATABASE_URL"
pg_restore --list "$plain" >/dev/null
age --encrypt "${age_recipient_args[@]}" --output "$encrypted" "$plain"
[[ -s "$encrypted" ]] || { echo "Encrypted backup is empty" >&2; exit 1; }
(cd "$BACKUP_OUTPUT_DIR" && sha256sum "$(basename "$encrypted")" > "$(basename "$checksum")" && sha256sum -c "$(basename "$checksum")")
{
 printf 'created_at_utc=%s\n' "$timestamp"
 printf 'database_name=%s\n' "$database_name"
 printf 'pg_dump_version=%s\n' "$(pg_dump --version)"
 printf 'dump_file=%s\n' "$(basename "$encrypted")"
 printf 'format=custom\nencryption=age\nrecipient_count=%s\n' "${#recipients[@]}"
 for i in "${!recipients[@]}"; do printf 'recipient_%s=%s\n' "$((i + 1))" "${recipients[$i]}"; done
 printf 'owner_and_acl=excluded\narchive_validation=passed_before_encryption\n'
} > "$manifest"
chmod 600 "$encrypted" "$checksum" "$manifest"
completed=1
trap - EXIT
cleanup
echo "Encrypted and checksummed backup: $encrypted"
