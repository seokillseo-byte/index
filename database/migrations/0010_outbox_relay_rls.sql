BEGIN;
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_tenant_or_relay ON app.outbox_events
 USING (
   current_user = 'index_assist_relay'
   OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
 )
 WITH CHECK (
   current_user = 'index_assist_relay'
   OR tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid
 );
GRANT SELECT, UPDATE ON app.outbox_events TO index_assist_relay;
COMMIT;
