#!/usr/bin/env bash
set -euo pipefail
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a dedicated non-production target}"
: "${RESTORE_DUMP_FILE:?Set RESTORE_DUMP_FILE}"
[[ "${RESTORE_CONFIRM_NONPROD:-}" == YES ]] || { echo "Set RESTORE_CONFIRM_NONPROD=YES only for non-production" >&2; exit 1; }
[[ "${RESTORE_TARGET_EMPTY:-}" == YES ]] || { echo "Confirm target is empty and disposable with RESTORE_TARGET_EMPTY=YES" >&2; exit 1; }
[[ -s "$RESTORE_DUMP_FILE" ]] || { echo "Dump missing or empty" >&2; exit 1; }
command -v pg_restore >/dev/null
command -v sha256sum >/dev/null
checksum="$RESTORE_DUMP_FILE.sha256"
[[ -f "$checksum" ]] || { echo "Missing checksum $checksum" >&2; exit 1; }
(cd "$(dirname "$RESTORE_DUMP_FILE")" && sha256sum -c "$(basename "$checksum")")
pg_restore --list "$RESTORE_DUMP_FILE" >/dev/null
# No --clean or --create: conflicts fail instead of deleting target objects.
pg_restore --no-password --exit-on-error --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" "$RESTORE_DUMP_FILE"
echo "Restore completed; run migrations, role setup and post-restore validation."
