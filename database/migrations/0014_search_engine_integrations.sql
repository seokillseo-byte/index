BEGIN;
INSERT INTO app.permissions(code,description)
VALUES('integration.manage','Connect and manage search-engine integrations')
ON CONFLICT(code) DO NOTHING;
INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r CROSS JOIN app.permissions p
WHERE r.code IN ('owner','admin','manager') AND p.code='integration.manage'
ON CONFLICT DO NOTHING;

CREATE TABLE app.integration_oauth_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 project_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('google_search_console','bing_webmaster')),
 state_hash bytea NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX integration_oauth_states_expiry_idx ON app.integration_oauth_states(expires_at) WHERE consumed_at IS NULL;

CREATE TABLE app.integration_secrets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 ciphertext bytea NOT NULL,
 iv bytea NOT NULL,
 auth_tag bytea NOT NULL,
 key_version text NOT NULL DEFAULT 'v1',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES app.integration_connections(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,connection_id),
 UNIQUE(tenant_id,id)
);

CREATE TABLE app.integration_sites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 project_id uuid NOT NULL,
 site_url text NOT NULL,
 permission_level text,
 verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified','verified','insufficient_permission','error')),
 last_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,connection_id) REFERENCES app.integration_connections(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,project_id,connection_id,site_url)
);
CREATE INDEX integration_sites_project_idx ON app.integration_sites(tenant_id,project_id);

CREATE TABLE app.provider_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 provider text NOT NULL CHECK(provider IN ('google_search_console','bing_webmaster','indexnow')),
 action text NOT NULL CHECK(action IN ('inspect','submit_url','submit_sitemap','indexnow_notify')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','leased','accepted','completed','retrying','dead_letter','rejected','cancelled')),
 url text,
 site_url text NOT NULL,
 idempotency_key text NOT NULL,
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 max_attempts integer NOT NULL DEFAULT 8 CHECK(max_attempts>0),
 scheduled_at timestamptz NOT NULL DEFAULT now(),
 lease_owner text,
 lease_expires_at timestamptz,
 response_code integer,
 provider_request_id text,
 provider_result jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_error text,
 submitted_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,connection_id) REFERENCES app.integration_connections(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX provider_jobs_due_idx ON app.provider_jobs(tenant_id,provider,scheduled_at) WHERE status IN ('queued','retrying');
CREATE INDEX provider_jobs_project_time_idx ON app.provider_jobs(tenant_id,project_id,created_at DESC);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['integration_oauth_states','integration_secrets','integration_sites','provider_jobs'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
COMMIT;
