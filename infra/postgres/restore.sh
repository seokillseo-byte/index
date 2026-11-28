#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a dedicated non-production target}"
: "${RESTORE_DUMP_FILE:?Set RESTORE_DUMP_FILE to an encrypted .dump.age file}"
: "${RESTORE_AGE_IDENTITY_FILE:?Set RESTORE_AGE_IDENTITY_FILE to a protected age identity file}"
[[ "${RESTORE_CONFIRM_NONPROD:-}" == YES ]] || { echo "Set RESTORE_CONFIRM_NONPROD=YES only for non-production" >&2; exit 1; }
[[ "${RESTORE_TARGET_EMPTY:-}" == YES ]] || { echo "Confirm target is empty and disposable with RESTORE_TARGET_EMPTY=YES" >&2; exit 1; }
[[ -s "$RESTORE_DUMP_FILE" ]] || { echo "Encrypted dump missing or empty" >&2; exit 1; }
[[ "$RESTORE_DUMP_FILE" == *.dump.age ]] || { echo "Only age-encrypted .dump.age backups are accepted" >&2; exit 1; }
[[ -r "$RESTORE_AGE_IDENTITY_FILE" ]] || { echo "Age identity file is not readable" >&2; exit 1; }
command -v pg_restore >/dev/null
command -v age >/dev/null
command -v sha256sum >/dev/null
checksum="$RESTORE_DUMP_FILE.sha256"
[[ -f "$checksum" ]] || { echo "Missing checksum $checksum" >&2; exit 1; }
(cd "$(dirname "$RESTORE_DUMP_FILE")" && sha256sum -c "$(basename "$checksum")")
umask 077
workdir="$(mktemp -d "${TMPDIR:-/tmp}/index-assist-restore.XXXXXX")"
plain="$workdir/restore.dump"
cleanup() { rm -rf "$workdir"; }
trap cleanup EXIT
age --decrypt --identity "$RESTORE_AGE_IDENTITY_FILE" --output "$plain" "$RESTORE_DUMP_FILE"
pg_restore --list "$plain" >/dev/null
# No --clean or --create: conflicts fail instead of deleting target DB objects.
pg_restore --no-password --exit-on-error --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" "$plain"
echo "Encrypted backup restored; run migrations, role setup and post-restore validation."
