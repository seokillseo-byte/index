-- Index Assist foundational multi-tenant schema.
-- Run as migration owner. Runtime roles must not own tables or bypass RLS.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE app.member_status AS ENUM ('invited','active','suspended','removed');
CREATE TYPE app.project_status AS ENUM ('active','paused','archived');
CREATE TYPE app.url_status AS ENUM ('queued','checking','eligible','blocked','error','archived');
CREATE TYPE app.campaign_status AS ENUM ('draft','scheduled','running','paused','completed','failed','cancelled');
CREATE TYPE app.search_engine AS ENUM ('google','bing');
CREATE TYPE app.observation_kind AS ENUM ('http','robots','canonical','backlink','discovery','crawl','index');
CREATE TYPE app.ad_campaign_status AS ENUM ('draft','pending_review','approved','scheduled','active','paused','completed','rejected');

CREATE TABLE app.tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL UNIQUE, password_hash text,
 display_name text, email_verified_at timestamptz, mfa_enabled boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','locked','disabled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, is_system boolean NOT NULL DEFAULT false);
CREATE TABLE app.permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, description text NOT NULL);
CREATE TABLE app.role_permissions (role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE, permission_id uuid NOT NULL REFERENCES app.permissions(id) ON DELETE CASCADE, PRIMARY KEY(role_id,permission_id));
CREATE TABLE app.tenant_members (
 tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
 role_id uuid NOT NULL REFERENCES app.roles(id), status app.member_status NOT NULL DEFAULT 'invited',
 joined_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE app.plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 monthly_price_minor bigint NOT NULL DEFAULT 0 CHECK(monthly_price_minor>=0), currency char(3) NOT NULL DEFAULT 'USD',
 daily_url_quota bigint NOT NULL CHECK(daily_url_quota>=0), max_projects integer NOT NULL CHECK(max_projects>=0),
 features jsonb NOT NULL DEFAULT '{}'::jsonb, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id), plan_id uuid NOT NULL REFERENCES app.plans(id),
 status text NOT NULL CHECK(status IN ('trialing','active','past_due','paused','cancelled','expired')),
 billing_interval text NOT NULL CHECK(billing_interval IN ('month','year')), current_period_start timestamptz NOT NULL,
 current_period_end timestamptz NOT NULL, external_customer_id text, external_subscription_id text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,tenant_id)
);
CREATE INDEX subscriptions_tenant_status_idx ON app.subscriptions(tenant_id,status);
CREATE TABLE app.projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 name text NOT NULL, slug text NOT NULL, target_url text, status app.project_status NOT NULL DEFAULT 'active',
 settings jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,slug)
);
CREATE TABLE app.verified_domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 project_id uuid NOT NULL, hostname text NOT NULL,
 verification_method text NOT NULL CHECK(verification_method IN ('dns_txt','html_file','meta_tag','oauth')),
 verified_at timestamptz, verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified','failed','expired')),
 proof_reference text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE, UNIQUE(tenant_id,hostname)
);
CREATE TABLE app.urls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 project_id uuid NOT NULL, normalized_url text NOT NULL, url_hash bytea NOT NULL, hostname text NOT NULL,
 tier smallint NOT NULL CHECK(tier>=1), status app.url_status NOT NULL DEFAULT 'queued',
 quality_score smallint CHECK(quality_score BETWEEN 0 AND 100), last_checked_at timestamptz, next_check_at timestamptz,
 first_seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,project_id,url_hash), UNIQUE(tenant_id,id)
);
CREATE INDEX urls_tenant_project_status_idx ON app.urls(tenant_id,project_id,status);
CREATE INDEX urls_due_idx ON app.urls(next_check_at) WHERE status IN ('queued','eligible','error');
CREATE INDEX urls_hostname_idx ON app.urls(tenant_id,hostname);
CREATE TABLE app.backlink_relationships (
 tenant_id uuid NOT NULL, source_url_id uuid NOT NULL, target_url_id uuid NOT NULL, anchor_text text,
 rel_attributes text[] NOT NULL DEFAULT '{}', discovered_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,source_url_id,target_url_id), CHECK(source_url_id<>target_url_id),
 FOREIGN KEY(tenant_id,source_url_id) REFERENCES app.urls(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,target_url_id) REFERENCES app.urls(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX backlink_relationships_target_idx ON app.backlink_relationships(tenant_id,target_url_id);
CREATE TABLE app.campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 project_id uuid NOT NULL, name text NOT NULL, status app.campaign_status NOT NULL DEFAULT 'draft',
 priority smallint NOT NULL DEFAULT 5 CHECK(priority BETWEEN 1 AND 10), starts_at timestamptz, created_by uuid REFERENCES app.users(id),
 settings jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE app.campaign_urls (
 tenant_id uuid NOT NULL, campaign_id uuid NOT NULL, url_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','submitted','observed','failed','skipped')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,campaign_id,url_id),
 FOREIGN KEY(tenant_id,campaign_id) REFERENCES app.campaigns(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,url_id) REFERENCES app.urls(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX campaign_urls_status_idx ON app.campaign_urls(tenant_id,campaign_id,status);
CREATE TABLE app.url_observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL, url_id uuid NOT NULL,
 kind app.observation_kind NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL,
 result jsonb NOT NULL, confidence text NOT NULL DEFAULT 'observed' CHECK(confidence IN ('verified','observed','estimated')),
 FOREIGN KEY(tenant_id,url_id) REFERENCES app.urls(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX url_observations_tenant_url_time_idx ON app.url_observations(tenant_id,url_id,observed_at DESC);
CREATE INDEX url_observations_time_brin_idx ON app.url_observations USING brin(observed_at);
CREATE TABLE app.integration_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('google_search_console','bing_webmaster','indexnow')),
 display_name text NOT NULL, credential_secret_ref text NOT NULL, scopes text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','connected','expired','revoked','error')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE app.orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES app.tenants(id),
 order_number text NOT NULL UNIQUE, status text NOT NULL CHECK(status IN ('pending','awaiting_payment','paid','fulfilled','cancelled','refunded','rejected')),
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0), tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),
 total_minor bigint NOT NULL CHECK(total_minor>=0), currency char(3) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE app.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, order_id uuid NOT NULL, provider text NOT NULL,
 provider_reference text, status text NOT NULL CHECK(status IN ('pending','authorized','succeeded','failed','refunded')),
 amount_minor bigint NOT NULL CHECK(amount_minor>=0), currency char(3) NOT NULL, idempotency_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(tenant_id,order_id) REFERENCES app.orders(tenant_id,id)
);

-- Ad operations: paid placements must be disclosed, consent-aware, and policy-compliant.
CREATE TABLE app.advertisers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, contact_email citext NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','closed')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.ad_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 surface text NOT NULL CHECK(surface IN ('public','customer','admin')), placement text NOT NULL,
 allowed_formats text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT false, policy_config jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE app.ad_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), advertiser_id uuid REFERENCES app.advertisers(id),
 name text NOT NULL, status app.ad_campaign_status NOT NULL DEFAULT 'draft', destination_url text NOT NULL,
 starts_at timestamptz, ends_at timestamptz, budget_minor bigint CHECK(budget_minor>=0), currency char(3),
 approved_by uuid REFERENCES app.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.ad_creatives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES app.ad_campaigns(id) ON DELETE CASCADE,
 slot_id uuid NOT NULL REFERENCES app.ad_slots(id), headline text, asset_key text, alt_text text,
 disclosure_label text NOT NULL DEFAULT 'Advertisement',
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','approved','rejected','disabled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.ad_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, campaign_id uuid NOT NULL REFERENCES app.ad_campaigns(id),
 creative_id uuid NOT NULL REFERENCES app.ad_creatives(id), slot_id uuid NOT NULL REFERENCES app.ad_slots(id),
 event_type text NOT NULL CHECK(event_type IN ('impression','click')), occurred_at timestamptz NOT NULL DEFAULT now(),
 consent_state text NOT NULL, fraud_score smallint CHECK(fraud_score BETWEEN 0 AND 100)
);
CREATE INDEX ad_events_campaign_time_idx ON app.ad_events(campaign_id,occurred_at);
CREATE INDEX ad_events_time_brin_idx ON app.ad_events USING brin(occurred_at);
CREATE TABLE app.audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid REFERENCES app.tenants(id) ON DELETE SET NULL,
 actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL, action text NOT NULL, resource_type text NOT NULL,
 resource_id text, ip_address inet, user_agent text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_time_idx ON app.audit_logs(tenant_id,created_at DESC);

-- Defense-in-depth tenant isolation. Set app.tenant_id with SET LOCAL inside each transaction.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['projects','verified_domains','urls','backlink_relationships','campaigns','campaign_urls','url_observations','integration_connections','subscriptions','orders','payments'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END $$;
COMMIT;
