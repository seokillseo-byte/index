BEGIN;

ALTER TABLE app.auth_tokens
  DROP CONSTRAINT IF EXISTS auth_tokens_purpose_check;

ALTER TABLE app.auth_tokens
  ADD CONSTRAINT auth_tokens_purpose_check
  CHECK(purpose IN ('email_verification','password_reset','mfa_recovery','mfa_login'));

CREATE TABLE app.mfa_credentials (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  secret_ciphertext bytea NOT NULL,
  secret_iv bytea NOT NULL,
  secret_auth_tag bytea NOT NULL,
  key_version text NOT NULL DEFAULT 'v1',
  enrolled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_active_purpose_idx
  ON app.auth_tokens(user_id,purpose,expires_at)
  WHERE consumed_at IS NULL;

COMMIT;
