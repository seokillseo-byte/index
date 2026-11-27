BEGIN;
CREATE POLICY tenant_member_self_read ON app.tenant_members FOR SELECT USING (user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid);
COMMIT;
