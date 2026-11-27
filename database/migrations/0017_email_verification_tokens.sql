BEGIN;

CREATE TABLE app.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_verification_tokens_user_idx
  ON app.email_verification_tokens(user_id, created_at DESC);

CREATE INDEX email_verification_tokens_active_idx
  ON app.email_verification_tokens(token_hash, expires_at)
  WHERE used_at IS NULL;

-- Verification tokens are authentication artifacts, not tenant-owned business data.
-- Access is restricted by the high-entropy token hash and the API runtime role.
COMMIT;
