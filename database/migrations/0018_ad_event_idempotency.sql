BEGIN;
ALTER TABLE app.ad_events ADD COLUMN event_key uuid;
CREATE UNIQUE INDEX ad_events_event_key_unique ON app.ad_events(event_key) WHERE event_key IS NOT NULL;
COMMIT;
