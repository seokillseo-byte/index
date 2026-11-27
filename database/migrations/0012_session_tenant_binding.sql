BEGIN;
ALTER TABLE app.user_sessions ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE app.user_sessions s
SET tenant_id = (
 SELECT tm.tenant_id FROM app.tenant_members tm
 WHERE tm.user_id=s.user_id AND tm.status='active'
 ORDER BY tm.joined_at ASC NULLS LAST LIMIT 1
)
WHERE tenant_id IS NULL;
DELETE FROM app.user_sessions WHERE tenant_id IS NULL;
ALTER TABLE app.user_sessions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE app.user_sessions ADD CONSTRAINT user_sessions_tenant_fk
 FOREIGN KEY(tenant_id) REFERENCES app.tenants(id) ON DELETE CASCADE;
CREATE INDEX user_sessions_tenant_user_idx ON app.user_sessions(tenant_id,user_id);
COMMIT;
