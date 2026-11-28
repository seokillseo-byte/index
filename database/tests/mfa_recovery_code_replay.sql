-- Run after all migrations as the migration owner:
-- psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/mfa_recovery_code_replay.sql
BEGIN;
SET LOCAL ROLE index_assist_runtime;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_token_id uuid := gen_random_uuid();
  v_token_hash bytea := digest('mfa-recovery-replay-'||v_user_id::text,'sha256');
BEGIN
  INSERT INTO app.users(id,email,password_hash,display_name,mfa_enabled)
  VALUES(
    v_user_id,
    ('mfa-recovery-replay-'||replace(v_user_id::text,'-','')||'@example.invalid')::citext,
    'test-only-password-hash',
    'MFA recovery replay test',
    true
  );

  INSERT INTO app.auth_tokens(id,user_id,purpose,token_hash,expires_at)
  VALUES(v_token_id,v_user_id,'mfa_recovery',v_token_hash,now()+interval '10 years');

  UPDATE app.auth_tokens
     SET consumed_at=now()
   WHERE id=v_token_id
     AND purpose='mfa_recovery'
     AND consumed_at IS NULL
     AND expires_at>now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MFA RECOVERY REPLAY FAILURE: first recovery-code consumption did not succeed';
  END IF;

  UPDATE app.auth_tokens
     SET consumed_at=now()
   WHERE id=v_token_id
     AND purpose='mfa_recovery'
     AND consumed_at IS NULL
     AND expires_at>now();

  IF FOUND THEN
    RAISE EXCEPTION 'MFA RECOVERY REPLAY FAILURE: second recovery-code consumption succeeded';
  END IF;
END $$;

ROLLBACK;
