-- Run as migration owner after all migrations:
-- psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/platform_admin_rls.sql
BEGIN;
DO $$
DECLARE
 admin_user uuid:=gen_random_uuid();
 normal_user uuid:=gen_random_uuid();
 tenant_a uuid:=gen_random_uuid();
 tenant_b uuid:=gen_random_uuid();
 project_b uuid:=gen_random_uuid();
BEGIN
 INSERT INTO app.users(id,email,display_name) VALUES(admin_user,('platform-admin-'||admin_user::text||'@example.invalid')::citext,'Platform admin');
 INSERT INTO app.users(id,email,display_name) VALUES(normal_user,('tenant-user-'||normal_user::text||'@example.invalid')::citext,'Tenant user');
 INSERT INTO app.tenants(id,name,slug) VALUES(tenant_a,'Admin test A','admin-test-a-'||replace(admin_user::text,'-',''));
 INSERT INTO app.tenants(id,name,slug) VALUES(tenant_b,'Admin test B','admin-test-b-'||replace(admin_user::text,'-',''));
 INSERT INTO app.platform_admins(user_id,role,status) VALUES(admin_user,'super_admin','active');
 INSERT INTO app.projects(id,tenant_id,name,slug) VALUES(project_b,tenant_b,'Tenant B secret project','tenant-b-secret');
 INSERT INTO app.tenant_members(tenant_id,user_id,role_id,status,joined_at)
 SELECT tenant_a,normal_user,id,'active',now() FROM app.roles WHERE code='owner';
 PERFORM set_config('test.admin_user',admin_user::text,true);
 PERFORM set_config('test.normal_user',normal_user::text,true);
 PERFORM set_config('test.tenant_a',tenant_a::text,true);
 PERFORM set_config('test.tenant_b',tenant_b::text,true);
 PERFORM set_config('test.project_b',project_b::text,true);
END $$;

SET LOCAL ROLE index_assist_runtime;
SELECT set_config('app.auth_user_id',current_setting('test.admin_user'),true);
SELECT set_config('app.tenant_id','',true);
DO $$
DECLARE
 tenant_b uuid:=current_setting('test.tenant_b')::uuid;
 project_b uuid:=current_setting('test.project_b')::uuid;
BEGIN
 IF NOT app.is_platform_admin() THEN RAISE EXCEPTION 'PLATFORM ADMIN FAILURE: active admin was not recognized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.projects WHERE id=project_b) THEN RAISE EXCEPTION 'PLATFORM ADMIN FAILURE: cross-tenant project read was denied'; END IF;
 UPDATE app.tenants SET status='suspended' WHERE id=tenant_b;
 INSERT INTO app.platform_admin_audit_logs(actor_user_id,action,resource_type,resource_id)
 VALUES(current_setting('test.admin_user')::uuid,'test.platform.admin','tenant',tenant_b::text);
END $$;

SELECT set_config('app.auth_user_id',current_setting('test.normal_user'),true);
SELECT set_config('app.tenant_id',current_setting('test.tenant_a'),true);
DO $$
DECLARE project_b uuid:=current_setting('test.project_b')::uuid;
BEGIN
 IF app.is_platform_admin() THEN RAISE EXCEPTION 'PLATFORM ADMIN FAILURE: normal tenant user was elevated'; END IF;
 IF EXISTS(SELECT 1 FROM app.projects WHERE id=project_b) THEN RAISE EXCEPTION 'PLATFORM ADMIN FAILURE: normal tenant user read cross-tenant project'; END IF;
 IF EXISTS(SELECT 1 FROM app.platform_admin_audit_logs) THEN RAISE EXCEPTION 'PLATFORM ADMIN FAILURE: normal tenant user read platform audit log'; END IF;
END $$;
ROLLBACK;
