BEGIN;
CREATE TABLE app.user_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 refresh_token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 ip_address inet, user_agent text, created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_active_idx ON app.user_sessions(user_id,expires_at) WHERE revoked_at IS NULL;

CREATE TABLE app.auth_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('email_verification','password_reset','mfa_recovery')),
 token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_purpose_idx ON app.auth_tokens(user_id,purpose,expires_at);

CREATE TABLE app.tenant_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 email citext NOT NULL, role_id uuid NOT NULL REFERENCES app.roles(id), invited_by uuid REFERENCES app.users(id),
 token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,email)
);

CREATE TABLE app.api_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 name text NOT NULL, key_prefix text NOT NULL, key_hash bytea NOT NULL UNIQUE, scopes text[] NOT NULL DEFAULT '{}',
 last_used_at timestamptz, expires_at timestamptz, revoked_at timestamptz, created_by uuid REFERENCES app.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE INDEX api_keys_active_idx ON app.api_keys(tenant_id,key_prefix) WHERE revoked_at IS NULL;

CREATE TABLE app.webhook_endpoints (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 url text NOT NULL, secret_ref text NOT NULL, subscribed_events text[] NOT NULL DEFAULT '{}',
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE app.webhook_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, endpoint_id uuid NOT NULL,
 event_id uuid NOT NULL, status text NOT NULL CHECK(status IN ('pending','delivered','retrying','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0), response_code integer, next_attempt_at timestamptz,
 delivered_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,endpoint_id) REFERENCES app.webhook_endpoints(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(endpoint_id,event_id)
);
CREATE INDEX webhook_deliveries_due_idx ON app.webhook_deliveries(next_attempt_at) WHERE status IN ('pending','retrying');

CREATE TABLE app.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 user_id uuid REFERENCES app.users(id) ON DELETE CASCADE, category text NOT NULL, title text NOT NULL,
 body text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON app.notifications(tenant_id,user_id,created_at DESC) WHERE read_at IS NULL;

-- Tenant-scoped tables are protected by PostgreSQL RLS. Set the GUC only after
-- authenticating the user and confirming active tenant membership.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['api_keys','tenant_invitations','webhook_endpoints','webhook_deliveries','notifications'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;

INSERT INTO app.roles(code,name,is_system) VALUES
 ('owner','Tenant owner',true),('admin','Tenant administrator',true),
 ('manager','Project manager',true),('analyst','SEO analyst',true),('viewer','Read-only viewer',true),
 ('super_admin','Platform super administrator',true)
ON CONFLICT(code) DO NOTHING;

INSERT INTO app.permissions(code,description) VALUES
 ('tenant.read','Read tenant workspace'),('tenant.manage','Manage tenant settings and members'),
 ('project.read','Read projects'),('project.manage','Create and manage projects'),
 ('url.read','Read URL inventory'),('url.manage','Import and manage URLs'),
 ('campaign.manage','Create and operate campaigns'),('report.read','Read analytics reports'),
 ('billing.manage','Manage subscriptions and billing'),('api_key.manage','Manage API keys'),
 ('webhook.manage','Manage webhook endpoints'),('cms.manage','Manage public CMS content'),
 ('ads.manage','Manage advertising inventory and campaigns'),('admin.manage','Manage platform administration')
ON CONFLICT(code) DO NOTHING;
COMMIT;
