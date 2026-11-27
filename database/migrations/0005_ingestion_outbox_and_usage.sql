BEGIN;
CREATE TABLE app.ingestion_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, project_id uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('dashboard','api','csv','txt','integration')),
 idempotency_key text NOT NULL, total_submitted bigint NOT NULL DEFAULT 0 CHECK(total_submitted>=0),
 accepted_count bigint NOT NULL DEFAULT 0 CHECK(accepted_count>=0),
 duplicate_count bigint NOT NULL DEFAULT 0 CHECK(duplicate_count>=0),
 rejected_count bigint NOT NULL DEFAULT 0 CHECK(rejected_count>=0),
 status text NOT NULL DEFAULT 'accepted' CHECK(status IN ('accepted','processing','completed','partial','failed')),
 created_by uuid REFERENCES app.users(id), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,idempotency_key), UNIQUE(tenant_id,id)
);
CREATE INDEX ingestion_batches_tenant_created_idx ON app.ingestion_batches(tenant_id,created_at DESC);

CREATE TABLE app.outbox_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES app.tenants(id) ON DELETE CASCADE,
 aggregate_type text NOT NULL, aggregate_id text NOT NULL, event_type text NOT NULL,
 topic text NOT NULL, partition_key text NOT NULL, payload jsonb NOT NULL,
 idempotency_key text NOT NULL UNIQUE, attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_due_idx ON app.outbox_events(next_attempt_at,created_at) WHERE published_at IS NULL;

CREATE TABLE app.url_processing_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, url_id uuid NOT NULL,
 task_type text NOT NULL CHECK(task_type IN ('http_check','html_analysis','backlink_verify','discovery','index_monitor')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','completed','retrying','dead_letter','cancelled')),
 priority smallint NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 10),
 scheduled_at timestamptz NOT NULL DEFAULT now(), attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count>=0),
 max_attempts integer NOT NULL DEFAULT 8 CHECK(max_attempts>0), lease_owner text, lease_expires_at timestamptz,
 idempotency_key text NOT NULL UNIQUE, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,url_id) REFERENCES app.urls(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX url_tasks_due_idx ON app.url_processing_tasks(priority DESC,scheduled_at) WHERE status IN ('pending','retrying');
CREATE INDEX url_tasks_expired_lease_idx ON app.url_processing_tasks(lease_expires_at) WHERE status='leased';

CREATE TABLE app.tenant_usage_daily (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE, usage_date date NOT NULL,
 accepted_urls bigint NOT NULL DEFAULT 0, analyzed_urls bigint NOT NULL DEFAULT 0,
 api_requests bigint NOT NULL DEFAULT 0, google_inspections bigint NOT NULL DEFAULT 0,
 bing_submissions bigint NOT NULL DEFAULT 0, ad_impressions bigint NOT NULL DEFAULT 0,
 ad_clicks bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,usage_date)
);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ingestion_batches','url_processing_tasks','tenant_usage_daily'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
COMMIT;
