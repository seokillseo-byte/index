# PostgreSQL runtime role

The init script is executed only when the PostgreSQL data directory is first initialized. It creates `index_assist_runtime`, a non-superuser, non-owner, non-BYPASSRLS login. API and worker services must connect with this role, never with the bootstrap `POSTGRES_USER`.

Set a long random `APP_DB_PASSWORD` before the first boot. If the volume already exists, run the equivalent role creation and grants manually as the database administrator; changing the init script does not rerun it.

Migrations must run as the database bootstrap/migration owner. The runtime role receives table and sequence privileges through default privileges for objects created by that owner. Do not grant it ownership or BYPASSRLS.
