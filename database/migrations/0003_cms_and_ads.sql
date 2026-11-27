BEGIN;
CREATE TYPE app.content_status AS ENUM ('draft','in_review','scheduled','published','archived');
CREATE TABLE app.cms_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, title text NOT NULL,
 body jsonb NOT NULL DEFAULT '{}'::jsonb, status app.content_status NOT NULL DEFAULT 'draft',
 published_at timestamptz, created_by uuid REFERENCES app.users(id), updated_by uuid REFERENCES app.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.cms_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE, title text NOT NULL,
 excerpt text, body jsonb NOT NULL DEFAULT '{}'::jsonb, status app.content_status NOT NULL DEFAULT 'draft',
 author_id uuid REFERENCES app.users(id), published_at timestamptz, featured_image_key text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cms_posts_public_idx ON app.cms_posts(published_at DESC) WHERE status='published';
CREATE TABLE app.cms_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
 description text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.cms_post_categories (
 post_id uuid NOT NULL REFERENCES app.cms_posts(id) ON DELETE CASCADE,
 category_id uuid NOT NULL REFERENCES app.cms_categories(id) ON DELETE CASCADE,
 PRIMARY KEY(post_id,category_id)
);
CREATE TABLE app.seo_metadata (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL CHECK(entity_type IN ('page','post')),
 entity_id uuid NOT NULL, seo_title text, meta_description text, canonical_url text,
 robots_index boolean NOT NULL DEFAULT true, robots_follow boolean NOT NULL DEFAULT true,
 og_title text, og_description text, og_image_key text, schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(entity_type,entity_id)
);
CREATE TABLE app.cms_redirects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_path text NOT NULL UNIQUE, destination_url text NOT NULL,
 status_code smallint NOT NULL CHECK(status_code IN (301,302,307,308)), enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.advertiser_inquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, contact_name text NOT NULL,
 email citext NOT NULL, website_url text, requested_budget_minor bigint CHECK(requested_budget_minor>=0),
 message text, status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','qualified','rejected','converted')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_campaigns_active_window_idx ON app.ad_campaigns(starts_at,ends_at) WHERE status IN ('approved','scheduled','active');
COMMIT;
