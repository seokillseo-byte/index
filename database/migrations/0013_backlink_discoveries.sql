BEGIN;
CREATE TABLE app.backlink_discoveries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL,
 source_url_id uuid NOT NULL,
 target_url text NOT NULL,
 target_url_hash bytea NOT NULL,
 anchor_text text NOT NULL DEFAULT '',
 rel_attributes text[] NOT NULL DEFAULT '{}',
 link_type text NOT NULL DEFAULT 'follow' CHECK(link_type IN ('follow','nofollow','sponsored','ugc','mixed')),
 discovered_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 occurrence_count integer NOT NULL DEFAULT 1 CHECK(occurrence_count>0),
 FOREIGN KEY(tenant_id,project_id) REFERENCES app.projects(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,source_url_id) REFERENCES app.urls(tenant_id,id) ON DELETE CASCADE,
 UNIQUE(tenant_id,source_url_id,target_url_hash,anchor_text)
);
CREATE INDEX backlink_discoveries_project_seen_idx ON app.backlink_discoveries(tenant_id,project_id,last_seen_at DESC);
CREATE INDEX backlink_discoveries_target_idx ON app.backlink_discoveries(tenant_id,target_url_hash);
ALTER TABLE app.backlink_discoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.backlink_discoveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.backlink_discoveries
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
COMMIT;
