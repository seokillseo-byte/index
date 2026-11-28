#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL}"
: "${BACKUP_OUTPUT_DIR:?Set BACKUP_OUTPUT_DIR}"
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT to the age public recipient}"
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
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$encrypted" "$plain"
[[ -s "$encrypted" ]] || { echo "Encrypted backup is empty" >&2; exit 1; }
(cd "$BACKUP_OUTPUT_DIR" && sha256sum "$(basename "$encrypted")" > "$(basename "$checksum")" && sha256sum -c "$(basename "$checksum")")
{
 printf 'created_at_utc=%s\n' "$timestamp"
 printf 'database_name=%s\n' "$database_name"
 printf 'pg_dump_version=%s\n' "$(pg_dump --version)"
 printf 'dump_file=%s\n' "$(basename "$encrypted")"
 printf 'format=custom\nencryption=age\nowner_and_acl=excluded\narchive_validation=passed_before_encryption\n'
} > "$manifest"
chmod 600 "$encrypted" "$checksum" "$manifest"
completed=1
trap - EXIT
cleanup
echo "Encrypted and checksummed backup: $encrypted"
