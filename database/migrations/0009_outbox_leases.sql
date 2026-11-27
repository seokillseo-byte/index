BEGIN;
ALTER TABLE app.outbox_events ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE app.outbox_events ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS outbox_expired_lease_idx ON app.outbox_events(lease_expires_at) WHERE published_at IS NULL;
COMMIT;
