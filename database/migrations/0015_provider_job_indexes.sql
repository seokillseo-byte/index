BEGIN;
CREATE INDEX provider_jobs_claim_site_idx
 ON app.provider_jobs(tenant_id,connection_id,project_id,site_url,provider,action,scheduled_at,created_at)
 WHERE status IN ('queued','retrying','leased');
CREATE INDEX provider_jobs_expired_lease_idx
 ON app.provider_jobs(tenant_id,connection_id,project_id,site_url,lease_expires_at)
 WHERE status='leased';
CREATE INDEX provider_jobs_property_quota_idx
 ON app.provider_jobs(tenant_id,site_url,provider,action,created_at DESC)
 WHERE status<>'cancelled';
CREATE INDEX provider_jobs_connection_history_idx
 ON app.provider_jobs(tenant_id,connection_id,project_id,created_at DESC);
COMMIT;
