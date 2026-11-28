BEGIN;

ALTER TABLE app.auth_tokens
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0
  CHECK (attempt_count >= 0);

-- The API increments this counter under SELECT ... FOR UPDATE and consumes
-- an MFA login challenge or recovery challenge after five invalid TOTP or recovery-code attempts.

COMMIT;
