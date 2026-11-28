#!/usr/bin/env bash
set -euo pipefail
: "${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL}"
: "${BACKUP_OUTPUT_DIR:?Set BACKUP_OUTPUT_DIR}"
command -v pg_dump >/dev/null
command -v pg_restore >/dev/null
command -v sha256sum >/dev/null
umask 077
mkdir -p "$BACKUP_OUTPUT_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_name="$(psql "$BACKUP_DATABASE_URL" -Atqc 'SELECT current_database()')"
safe_name="$(printf '%s' "$database_name" | tr -c 'A-Za-z0-9_.-' '_')"
base="index-assist-${safe_name}-${timestamp}-$$"
dump="$BACKUP_OUTPUT_DIR/$base.dump"
manifest="$BACKUP_OUTPUT_DIR/$base.manifest"
checksum="$dump.sha256"
for path in "$dump" "$manifest" "$checksum"; do [[ ! -e "$path" ]] || { echo "Refusing to overwrite $path" >&2; exit 1; }; done
pg_dump --format=custom --no-owner --no-acl --file "$dump" "$BACKUP_DATABASE_URL"
pg_restore --list "$dump" >/dev/null
(cd "$BACKUP_OUTPUT_DIR" && sha256sum "$(basename "$dump")" > "$(basename "$checksum")" && sha256sum -c "$(basename "$checksum")")
{
 printf 'created_at_utc=%s\n' "$timestamp"
 printf 'database_name=%s\n' "$database_name"
 printf 'pg_dump_version=%s\n' "$(pg_dump --version)"
 printf 'dump_file=%s\n' "$(basename "$dump")"
 printf 'format=custom\nowner_and_acl=excluded\narchive_validation=passed\n'
} > "$manifest"
chmod 600 "$dump" "$checksum" "$manifest"
echo "Validated backup: $dump"
