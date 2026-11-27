BEGIN;
ALTER TABLE app.provider_jobs ADD COLUMN last_attempt_at timestamptz;
CREATE INDEX provider_jobs_last_attempt_quota_idx
 ON app.provider_jobs(tenant_id,site_url,provider,action,last_attempt_at)
 WHERE last_attempt_at IS NOT NULL;
COMMIT;
