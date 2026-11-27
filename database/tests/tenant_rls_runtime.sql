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
  source_url_id uuid := gen_random_uuid();
  connection_a uuid := gen_random_uuid();
  secret_a uuid := gen_random_uuid();
  provider_job_id uuid := gen_random_uuid();
  claimed_job_id uuid;
  provider_quota_count integer;
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
  INSERT INTO app.urls(id,tenant_id,project_id,normalized_url,url_hash,hostname,tier,status) VALUES(source_url_id,tenant_a,project_a,'https://source.example/article',digest('https://source.example/article','sha256'),'source.example',1,'queued');
  INSERT INTO app.backlink_discoveries(tenant_id,project_id,source_url_id,target_url,target_url_hash,anchor_text) VALUES(tenant_a,project_a,source_url_id,'https://target.example/',digest('https://target.example/','sha256'),'target');
  INSERT INTO app.integration_connections(id,tenant_id,provider,display_name,credential_secret_ref,scopes,status) VALUES(connection_a,tenant_a,'google_search_console','RLS test',secret_a::text,ARRAY['test'],'connected');
  INSERT INTO app.integration_secrets(id,tenant_id,connection_id,ciphertext,iv,auth_tag) VALUES(secret_a,tenant_a,connection_a,decode('01','hex'),decode(repeat('00',12),'hex'),decode(repeat('00',16),'hex'));
  INSERT INTO app.integration_oauth_states(tenant_id,user_id,project_id,provider,state_hash,expires_at) VALUES(tenant_a,v_user_id,project_a,'google_search_console',digest('oauth-state-a','sha256'),now()+interval '5 minutes');
  INSERT INTO app.integration_sites(tenant_id,connection_id,project_id,site_url,permission_level,verification_status) VALUES(tenant_a,connection_a,project_a,'https://target.example/','siteOwner','verified');
  INSERT INTO app.provider_jobs(id,tenant_id,project_id,connection_id,provider,action,status,site_url,url,idempotency_key) VALUES(provider_job_id,tenant_a,project_a,connection_a,'google_search_console','inspect','queued','https://target.example/','https://target.example/','rls-provider-job-'||replace(v_user_id::text,'-',''));
  WITH due AS (
    SELECT id FROM app.provider_jobs
    WHERE tenant_id=tenant_a AND project_id=project_a AND connection_id=connection_a
      AND provider='google_search_console' AND site_url='https://target.example/' AND action='inspect'
      AND ((status IN ('queued','retrying') AND scheduled_at<=now()) OR (status='leased' AND lease_expires_at<now()))
    ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED
  )
  UPDATE app.provider_jobs j SET status='leased',lease_owner='rls-test-worker',
    lease_expires_at=now()+interval '10 minutes',attempt_count=j.attempt_count+1,updated_at=now()
  FROM due WHERE j.tenant_id=tenant_a AND j.id=due.id RETURNING j.id INTO claimed_job_id;
  IF claimed_job_id IS DISTINCT FROM provider_job_id THEN
    RAISE EXCEPTION 'PROVIDER JOB FAILURE: runtime worker could not claim the queued provider job';
  END IF;
  SELECT count(*) FILTER(WHERE created_at >= date_trunc('day',now()) OR last_attempt_at >= date_trunc('day',now()))::int INTO provider_quota_count FROM app.provider_jobs WHERE tenant_id=tenant_a AND site_url='https://target.example/' AND provider='google_search_console' AND action='inspect' AND status<>'cancelled';
  IF provider_quota_count<1 THEN RAISE EXCEPTION 'PROVIDER QUOTA FAILURE: provider job reservation count is incorrect'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(tenant_a::text||':https://target.example/:quota-test',0));
  PERFORM set_config('app.tenant_id',tenant_b::text,true);
  IF EXISTS(SELECT 1 FROM app.projects WHERE id=project_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A project';
  END IF;
  IF EXISTS(SELECT 1 FROM app.backlink_discoveries WHERE tenant_id=tenant_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A backlink discoveries';
  END IF;
  IF EXISTS(SELECT 1 FROM app.integration_secrets WHERE tenant_id=tenant_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A integration secrets';
  END IF;
  IF EXISTS(SELECT 1 FROM app.integration_oauth_states WHERE tenant_id=tenant_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A OAuth states';
  END IF;
  IF EXISTS(SELECT 1 FROM app.integration_sites WHERE tenant_id=tenant_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A provider sites';
  END IF;
  IF EXISTS(SELECT 1 FROM app.provider_jobs WHERE tenant_id=tenant_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant B can read tenant A provider jobs';
  END IF;
  BEGIN
    INSERT INTO app.backlink_discoveries(tenant_id,project_id,source_url_id,target_url,target_url_hash) VALUES(tenant_a,project_a,source_url_id,'https://target.example/other',digest('https://target.example/other','sha256'));
    RAISE EXCEPTION 'RLS FAILURE: tenant B inserted a tenant A backlink discovery';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    INSERT INTO app.projects(tenant_id,name,slug) VALUES(tenant_a,'Cross tenant write','cross-tenant-write');
    RAISE EXCEPTION 'RLS FAILURE: tenant B inserted into tenant A';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM set_config('app.auth_user_id',v_user_id::text,true);
  IF NOT EXISTS(SELECT 1 FROM app.tenants WHERE id=tenant_a) THEN
    RAISE EXCEPTION 'RLS FAILURE: authenticated user cannot read own tenant root';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM app.tenant_members WHERE tenant_id=tenant_a AND user_id=v_user_id) THEN
    RAISE EXCEPTION 'RLS FAILURE: authenticated user cannot read own membership';
  END IF;
END $$;
ROLLBACK;
