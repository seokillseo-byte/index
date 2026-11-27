-- Run as the migration owner after all migrations:
-- psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/tenant_rls_runtime.sql
BEGIN;
SET LOCAL ROLE index_assist_runtime;
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  tenant_a uuid := gen_random_uuid();
  tenant_b uuid := gen_random_uuid();
  project_a uuid := gen_random_uuid();
  owner_role uuid;
BEGIN
  INSERT INTO app.users(id,email,display_name) VALUES(v_user_id,('rls-test-'||v_user_id::text||'@example.invalid')::citext,'RLS test');
  PERFORM set_config('app.tenant_id',tenant_a::text,true);
  INSERT INTO app.tenants(id,name,slug) VALUES(tenant_a,'RLS tenant A','rls-a-'||replace(v_user_id::text,'-',''));
  PERFORM set_config('app.tenant_id',tenant_b::text,true);
  INSERT INTO app.tenants(id,name,slug) VALUES(tenant_b,'RLS tenant B','rls-b-'||replace(v_user_id::text,'-',''));
  SELECT id INTO owner_role FROM app.roles WHERE code='owner';
  PERFORM set_config('app.tenant_id',tenant_a::text,true);
  INSERT INTO app.tenant_members(tenant_id,user_id,role_id,status,joined_at) VALUES(tenant_a,v_user_id,owner_role,'active',now());
  INSERT INTO app.projects(id,tenant_id,name,slug) VALUES(project_a,tenant_a,'Tenant A project','tenant-a-project');
  PERFORM set_config('app.tenant_id',tenant_b::text,true);
  IF EXISTS(SELECT 1 FROM app.projects WHERE id=project_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A project';
  END IF;
  BEGIN
    INSERT INTO app.projects(tenant_id,name,slug) VALUES(tenant_a,'Cross tenant write','cross-tenant-write');
    RAISE EXCEPTION 'RLS FAILURE: tenant B inserted into tenant A';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM set_config('app.auth_user_id',v_user_id::text,true);
  IF NOT EXISTS(SELECT 1 FROM app.tenant_members WHERE tenant_id=tenant_a AND user_id=v_user_id) THEN
    RAISE EXCEPTION 'RLS FAILURE: authenticated user cannot read own membership';
  END IF;
END $$;
ROLLBACK;
