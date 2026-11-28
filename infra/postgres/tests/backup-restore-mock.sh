#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BIN="$TMP/bin"
OUT="$TMP/backups"
mkdir -p "$BIN" "$OUT"
export MOCK_LOG="$TMP/mock.log"
export RESTORE_MARKER="$TMP/restored"
: > "$MOCK_LOG"

cat > "$BIN/psql" <<'MOCK'
#!/usr/bin/env bash
printf 'test_database\n'
MOCK
cat > "$BIN/pg_dump" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == --version ]]; then echo 'pg_dump mock 1.0'; exit 0; fi
while (($#)); do
  if [[ "$1" == --file ]]; then shift; printf 'mock-pg-dump-archive\n' > "$1"; printf '%s\n' "$1" >> "$MOCK_LOG"; exit 0; fi
  shift
done
exit 2
MOCK
cat > "$BIN/pg_restore" <<'MOCK'
#!/usr/bin/env bash
if [[ "${1:-}" == --list ]]; then
  file="${2:?missing archive}"
  grep -q 'mock-pg-dump-archive' "$file"
  exit
fi
last=''
db=''
while (($#)); do
  if [[ "$1" == --dbname ]]; then shift; db="$1"; fi
  last="$1"
  shift
done
grep -q 'mock-pg-dump-archive' "$last"
printf '%s\n' "$db" > "$RESTORE_MARKER"
MOCK
cat > "$BIN/age" <<'MOCK'
#!/usr/bin/env bash
mode=''
output=''
input=''
while (($#)); do
  case "$1" in
    --encrypt|--decrypt) mode="$1"; shift ;;
    --recipient|--identity) shift 2 ;;
    --output) output="$2"; shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
[[ -n "$output" && -n "$input" ]]
cp "$input" "$output"
MOCK
chmod +x "$BIN"/*
export PATH="$BIN:$PATH"

export BACKUP_DATABASE_URL='postgresql://mock.invalid/test'
export BACKUP_OUTPUT_DIR="$OUT"
export BACKUP_AGE_RECIPIENT='age1mockpublicrecipient'
bash "$ROOT/infra/postgres/backup.sh" >/dev/null
shopt -s nullglob
artifacts=("$OUT"/*.dump.age)
[[ "${#artifacts[@]}" -eq 1 ]]
dump="${artifacts[0]}"
[[ -s "$dump" && -s "$dump.sha256" ]]
grep -q '^encryption=age$' "${dump%.dump.age}.manifest"
[[ "$(stat -c '%a' "$dump")" == 600 ]]
plain_path="$(tail -n 1 "$MOCK_LOG")"
[[ ! -e "$plain_path" ]]

identity="$TMP/age-identity.txt"
printf 'AGE-SECRET-IDENTITY-MOCK\n' > "$identity"
chmod 600 "$identity"
export RESTORE_DATABASE_URL='postgresql://mock.invalid/restore'
export RESTORE_DUMP_FILE="$dump"
export RESTORE_AGE_IDENTITY_FILE="$identity"
export RESTORE_CONFIRM_NONPROD=YES
export RESTORE_TARGET_EMPTY=YES
bash "$ROOT/infra/postgres/restore.sh" >/dev/null
[[ "$(cat "$RESTORE_MARKER")" == "$RESTORE_DATABASE_URL" ]]

rm -f "$RESTORE_MARKER"
if RESTORE_CONFIRM_NONPROD=NO bash "$ROOT/infra/postgres/restore.sh" >/dev/null 2>&1; then
  echo 'restore safety confirmation was not enforced' >&2
  exit 1
fi
[[ ! -e "$RESTORE_MARKER" ]]

tampered="$OUT/tampered.dump.age"
cp "$dump" "$tampered"
printf 'tamper' >> "$tampered"
cp "$dump.sha256" "$tampered.sha256"
export RESTORE_DUMP_FILE="$tampered"
if bash "$ROOT/infra/postgres/restore.sh" >/dev/null 2>&1; then
  echo 'tampered encrypted backup was accepted' >&2
  exit 1
fi
[[ ! -e "$RESTORE_MARKER" ]]
echo 'backup/restore mock tests passed'
