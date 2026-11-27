BEGIN;
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_root_scope ON app.tenants
 USING (
   id = nullif(current_setting('app.tenant_id',true),'')::uuid
   OR EXISTS (
     SELECT 1 FROM app.tenant_members tm
     WHERE tm.tenant_id = app.tenants.id
       AND tm.user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid
       AND tm.status = 'active'
   )
 )
 WITH CHECK (id = nullif(current_setting('app.tenant_id',true),'')::uuid);
COMMIT;
