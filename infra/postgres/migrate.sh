#!/usr/bin/env bash
set -euo pipefail
: "${MIGRATION_DATABASE_URL:?Set MIGRATION_DATABASE_URL to the migration-owner connection string}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS app"
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
shopt -s nullglob
for file in "$ROOT"/database/migrations/*.sql; do
  name="$(basename "$file")"
  applied="$(psql "$MIGRATION_DATABASE_URL" -Atqc "SELECT 1 FROM public.schema_migrations WHERE name = '$name'")"
  if [[ "$applied" == "1" ]]; then
    echo "skip $name"
    continue
  fi
  echo "apply $name"
  psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO public.schema_migrations(name) VALUES ('$name')"
done
