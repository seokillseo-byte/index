#!/bin/sh
set -eu
: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL is required}"
: "${PLATFORM_ADMIN_EMAIL:?Register the admin user first, then set PLATFORM_ADMIN_EMAIL}"
ROLE=${PLATFORM_ADMIN_ROLE:-super_admin}
case "$ROLE" in super_admin|admin|support|content_editor|ad_manager) ;; *) echo "Invalid platform admin role" >&2; exit 1;; esac
USER_ID=$(psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -v admin_email="$PLATFORM_ADMIN_EMAIL" -Atq -c "SELECT id FROM app.users WHERE email=:'admin_email'::citext LIMIT 1")
if [ -z "$USER_ID" ]; then
  echo "No registered user found for PLATFORM_ADMIN_EMAIL" >&2
  exit 1
fi
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -v admin_user_id="$USER_ID" -v admin_role="$ROLE" <<'SQL'
INSERT INTO app.platform_admins(user_id,role,status)
VALUES(:'admin_user_id'::uuid,:'admin_role','active')
ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,status='active',updated_at=now();
SQL
echo "Platform administrator provisioned."
