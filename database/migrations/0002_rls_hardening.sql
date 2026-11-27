BEGIN;
ALTER TABLE app.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.tenant_members
 USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);

ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_audit_isolation ON app.audit_logs
 USING (tenant_id IS NOT NULL AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id IS NOT NULL AND tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
COMMIT;
