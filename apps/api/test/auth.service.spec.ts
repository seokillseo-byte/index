import { AuthService } from '../src/auth/auth.service';

describe('AuthService MFA challenge hardening', () => {
  it('invalidates an MFA login challenge after five invalid codes', async () => {
    const state = {
      attemptCount: 0,
      consumed: false,
    };

    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes("purpose='mfa_login'") && sql.includes('FOR UPDATE')) {
          if (state.consumed) return { rowCount: 0, rows: [] };
          return {
            rowCount: 1,
            rows: [{ id: 'challenge-1', user_id: 'user-1', attempt_count: state.attemptCount }],
          };
        }

        if (sql.includes('FROM app.users u JOIN app.tenant_members')) {
          return {
            rowCount: 1,
            rows: [{
              id: 'user-1',
              email: 'mfa@example.invalid',
              display_name: 'MFA Test',
              tenant_id: 'tenant-1',
              tenant_name: 'Test Workspace',
              role_code: 'owner',
              secret_ciphertext: Buffer.alloc(1),
              secret_iv: Buffer.alloc(1),
              secret_auth_tag: Buffer.alloc(1),
            }],
          };
        }

        if (sql.includes('SET attempt_count=attempt_count+1')) {
          if (state.consumed) return { rowCount: 0, rows: [] };
          state.attemptCount += 1;
          if (state.attemptCount >= 5) state.consumed = true;
          return { rowCount: 1, rows: [] };
        }

        return { rowCount: 0, rows: [] };
      }),
    };

    const db = {
      withTransaction: jest.fn(async (work: (tx: typeof client) => Promise<unknown>) => work(client)),
      query: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) => key === 'INTEGRATION_ENCRYPTION_KEY' ? '00'.repeat(32) : undefined),
    };
    const jwt = { signAsync: jest.fn() };
    const email = { sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn() };

    const service = new AuthService(db as never, jwt as never, config as never, email as never);
    (service as unknown as { decryptSecret: () => string }).decryptSecret = () => 'unused-secret';
    (service as unknown as { verifyTotp: () => boolean }).verifyTotp = () => false;

    const challengeToken = 'A'.repeat(43);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await expect(service.completeMfaLogin(challengeToken, '000000')).rejects.toThrow(
        'Invalid MFA code or challenge exhausted',
      );
    }

    expect(state.attemptCount).toBe(5);
    expect(state.consumed).toBe(true);

    await expect(service.completeMfaLogin(challengeToken, '000000')).rejects.toThrow(
      'Invalid or expired MFA challenge',
    );
    expect(state.attemptCount).toBe(5);

    const updateCalls = client.query.mock.calls.filter(([sql]) =>
      sql.includes('SET attempt_count=attempt_count+1'),
    );
    expect(updateCalls).toHaveLength(5);
    expect(db.withTransaction).toHaveBeenCalledTimes(6);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not expose the raw MFA challenge token to the database', async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const db = {
      withTransaction: jest.fn(async (work: (tx: { query: jest.Mock }) => Promise<unknown>) => {
        const client = {
          query: jest.fn(async (sql: string, values: unknown[] = []) => {
            queries.push({ sql, values });
            if (sql.includes("purpose='mfa_login'") && sql.includes('FOR UPDATE')) {
              return { rowCount: 0, rows: [] };
            }
            return { rowCount: 0, rows: [] };
          }),
        };
        return work(client);
      }),
      query: jest.fn(),
    };
    const config = { get: jest.fn() };
    const jwt = { signAsync: jest.fn() };
    const email = { sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn() };
    const service = new AuthService(db as never, jwt as never, config as never, email as never);

    const rawToken = 'A'.repeat(43);
    await expect(service.completeMfaLogin(rawToken, '000000')).rejects.toThrow(
      'Invalid or expired MFA challenge',
    );

    const challengeLookup = queries.find((entry) => entry.sql.includes("purpose='mfa_login'"));
    expect(challengeLookup).toBeDefined();
    expect(challengeLookup?.values[0]).toBeInstanceOf(Buffer);
    expect(challengeLookup?.values[0]).not.toEqual(Buffer.from(rawToken));
  });
});
