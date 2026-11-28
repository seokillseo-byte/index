-- Run after all migrations as the migration owner:
-- psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/auth_token_replay.sql
BEGIN;
SET LOCAL ROLE index_assist_runtime;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_token_id uuid := gen_random_uuid();
  v_token_hash bytea := digest('auth-replay-test-'||v_user_id::text,'sha256');
  v_found integer;
BEGIN
  INSERT INTO app.users(id,email,password_hash,display_name)
  VALUES(
    v_user_id,
    ('auth-replay-'||replace(v_user_id::text,'-','')||'@example.invalid')::citext,
    'test-only-password-hash',
    'Auth replay test'
  );

  INSERT INTO app.auth_tokens(id,user_id,purpose,token_hash,expires_at)
  VALUES(v_token_id,v_user_id,'password_reset',v_token_hash,now()+interval '10 minutes');

  UPDATE app.auth_tokens
     SET consumed_at=now()
   WHERE id=v_token_id
     AND consumed_at IS NULL
     AND expires_at>now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUTH REPLAY FAILURE: first token consumption did not succeed';
  END IF;

  SELECT count(*) INTO v_found
    FROM app.auth_tokens
   WHERE token_hash=v_token_hash
     AND purpose='password_reset'
     AND consumed_at IS NULL
     AND expires_at>now();

  IF v_found<>0 THEN
    RAISE EXCEPTION 'AUTH REPLAY FAILURE: consumed token remains usable';
  END IF;

  SELECT count(*) INTO v_found
    FROM app.auth_tokens
   WHERE token_hash=v_token_hash
     AND purpose='password_reset'
     AND consumed_at IS NULL
     AND expires_at>now();

  IF v_found<>0 THEN
    RAISE EXCEPTION 'AUTH REPLAY FAILURE: second lookup can still claim the token';
  END IF;
END $$;

ROLLBACK;
