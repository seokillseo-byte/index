BEGIN;
CREATE TABLE app.platform_admins (
 user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('super_admin','admin','support','content_editor','ad_manager')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 created_by uuid REFERENCES app.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_admins FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_self_read ON app.platform_admins
 USING (user_id=nullif(current_setting('app.auth_user_id',true),'')::uuid);

CREATE OR REPLACE FUNCTION app.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=app,pg_temp
AS $$
 SELECT EXISTS(
  SELECT 1 FROM app.platform_admins pa
  WHERE pa.user_id=nullif(current_setting('app.auth_user_id',true),'')::uuid
    AND pa.status='active'
 )
$$;
GRANT EXECUTE ON FUNCTION app.is_platform_admin() TO index_assist_runtime;

-- Add a permissive platform-admin policy to every tenant-scoped RLS table.
DO $$
DECLARE item record;
BEGIN
 FOR item IN
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped
  WHERE n.nspname='app' AND c.relkind='r' AND c.relrowsecurity=true
 LOOP
  EXECUTE format('CREATE POLICY platform_admin_access ON app.%I USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin())',item.relname);
 END LOOP;
END $$;

-- Users have no tenant_id but are needed for cross-tenant support operations.
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.users FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_access ON app.users
 USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());

-- CMS and advertising inventory are platform-managed, not tenant-owned.
DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY[
  'cms_pages','cms_posts','cms_categories','cms_post_categories','seo_metadata','cms_redirects',
  'advertiser_inquiries','advertisers','ad_slots','ad_campaigns','ad_creatives','ad_events'
 ]
 LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',table_name);
  EXECUTE format('CREATE POLICY platform_admin_access ON app.%I USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin())',table_name);
 END LOOP;
END $$;

-- Public SEO/CMS reads are limited to published content and enabled redirects.
CREATE POLICY cms_pages_public_read ON app.cms_pages FOR SELECT USING (status='published' AND published_at<=now());
CREATE POLICY cms_posts_public_read ON app.cms_posts FOR SELECT USING (status='published' AND published_at<=now());
CREATE POLICY cms_categories_public_read ON app.cms_categories FOR SELECT USING (
 EXISTS(SELECT 1 FROM app.cms_post_categories pc JOIN app.cms_posts p ON p.id=pc.post_id
        WHERE pc.category_id=cms_categories.id AND p.status='published' AND p.published_at<=now())
);
CREATE POLICY cms_post_categories_public_read ON app.cms_post_categories FOR SELECT USING (
 EXISTS(SELECT 1 FROM app.cms_posts p WHERE p.id=cms_post_categories.post_id AND p.status='published' AND p.published_at<=now())
);
CREATE POLICY seo_metadata_public_read ON app.seo_metadata FOR SELECT USING (
 (entity_type='page' AND EXISTS(SELECT 1 FROM app.cms_pages p WHERE p.id=entity_id AND p.status='published' AND p.published_at<=now()))
 OR
 (entity_type='post' AND EXISTS(SELECT 1 FROM app.cms_posts p WHERE p.id=entity_id AND p.status='published' AND p.published_at<=now()))
);
CREATE POLICY cms_redirects_public_read ON app.cms_redirects FOR SELECT USING (enabled=true);

-- Public ad inventory is contextual and only serves approved creatives in active slots/campaigns.
CREATE POLICY ad_slots_public_read ON app.ad_slots FOR SELECT USING (enabled=true AND surface='public');
CREATE POLICY ad_campaigns_public_read ON app.ad_campaigns FOR SELECT USING (
 status='active' AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())
);
CREATE POLICY ad_creatives_public_read ON app.ad_creatives FOR SELECT USING (
 status='approved' AND EXISTS(
  SELECT 1 FROM app.ad_campaigns c JOIN app.ad_slots s ON s.id=ad_creatives.slot_id
  WHERE c.id=ad_creatives.campaign_id AND c.status='active'
    AND (c.starts_at IS NULL OR c.starts_at<=now()) AND (c.ends_at IS NULL OR c.ends_at>now())
    AND s.enabled=true AND s.surface='public'
 )
);
CREATE POLICY advertiser_inquiries_public_insert ON app.advertiser_inquiries
 FOR INSERT WITH CHECK (status='new');
CREATE POLICY ad_events_public_insert ON app.ad_events
 FOR INSERT WITH CHECK (
  event_type IN ('impression','click')
  AND EXISTS(
   SELECT 1 FROM app.ad_creatives cr
   JOIN app.ad_campaigns c ON c.id=cr.campaign_id
   JOIN app.ad_slots s ON s.id=cr.slot_id
   WHERE cr.id=ad_events.creative_id AND cr.campaign_id=ad_events.campaign_id
     AND s.id=ad_events.slot_id AND cr.status='approved' AND s.enabled=true
     AND c.status='active' AND (c.starts_at IS NULL OR c.starts_at<=now())
     AND (c.ends_at IS NULL OR c.ends_at>now())
  )
);

CREATE TABLE app.platform_admin_audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_user_id uuid NOT NULL REFERENCES app.users(id),
 action text NOT NULL,
 resource_type text NOT NULL,
 resource_id text,
 ip_address inet,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.platform_admin_audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admin_audit_access ON app.platform_admin_audit_logs
 USING (app.is_platform_admin()) WITH CHECK (app.is_platform_admin());
CREATE INDEX platform_admin_audit_time_idx ON app.platform_admin_audit_logs(created_at DESC);
CREATE INDEX platform_admin_audit_resource_idx ON app.platform_admin_audit_logs(resource_type,resource_id,created_at DESC);
COMMIT;
