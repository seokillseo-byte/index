BEGIN;

ALTER TABLE app.auth_tokens
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0
  CHECK (attempt_count >= 0);

-- MFA login challenges are invalidated after five failed TOTP attempts.
CREATE INDEX auth_tokens_mfa_challenge_attempts_idx
  ON app.auth_tokens(id, attempt_count)
  WHERE purpose = 'mfa_login' AND consumed_at IS NULL;

COMMIT;
