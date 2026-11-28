-- Run after all migrations as the migration owner:
-- psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/mfa_challenge_attempt_limits.sql
BEGIN;
SET LOCAL ROLE index_assist_runtime;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_challenge_id uuid := gen_random_uuid();
  v_attempt integer;
  v_consumed_at timestamptz;
BEGIN
  INSERT INTO app.users(id,email,password_hash,display_name)
  VALUES(
    v_user_id,
    ('mfa-lockout-'||replace(v_user_id::text,'-','')||'@example.invalid')::citext,
    'test-only-password-hash',
    'MFA lockout test'
  );

  INSERT INTO app.auth_tokens(
    id,user_id,purpose,token_hash,expires_at
  ) VALUES(
    v_challenge_id,
    v_user_id,
    'mfa_login',
    digest('mfa-lockout-challenge-'||v_user_id::text,'sha256'),
    now()+interval '10 minutes'
  );

  FOR v_attempt IN 1..5 LOOP
    UPDATE app.auth_tokens
       SET attempt_count=attempt_count+1,
           consumed_at=CASE
             WHEN attempt_count+1>=5 THEN now()
             ELSE consumed_at
           END
     WHERE id=v_challenge_id
       AND consumed_at IS NULL
       AND expires_at>now();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MFA LOCKOUT FAILURE: challenge stopped before attempt %',v_attempt;
    END IF;
  END LOOP;

  SELECT attempt_count,consumed_at
    INTO v_attempt,v_consumed_at
    FROM app.auth_tokens
   WHERE id=v_challenge_id;

  IF v_attempt<>5 THEN
    RAISE EXCEPTION 'MFA LOCKOUT FAILURE: expected five attempts, got %',v_attempt;
  END IF;

  IF v_consumed_at IS NULL THEN
    RAISE EXCEPTION 'MFA LOCKOUT FAILURE: challenge was not consumed on fifth failure';
  END IF;

  UPDATE app.auth_tokens
     SET attempt_count=attempt_count+1
   WHERE id=v_challenge_id
     AND consumed_at IS NULL
     AND expires_at>now();

  IF FOUND THEN
    RAISE EXCEPTION 'MFA LOCKOUT FAILURE: consumed challenge accepted a sixth attempt';
  END IF;
END $$;

ROLLBACK;
