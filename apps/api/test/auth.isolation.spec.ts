import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TenantContextGuard } from '../src/tenancy/tenant-context.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('authentication tenant/session isolation', () => {
  it('rejects an access token whose session is bound to a different tenant', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        sid: 'session-1',
        tid: 'tenant-b',
        role: 'owner',
      }),
    };
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
      withTransaction: jest.fn(),
    };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new JwtAuthGuard(jwt as never, reflector as never, db as never);

    await expect(guard.canActivate(contextFor({
      headers: { authorization: 'Bearer token' },
    }))).rejects.toThrow('Invalid, expired or revoked access token');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id=$2 AND tenant_id=$3'),
      ['session-1', 'user-1', 'tenant-b'],
    );
    expect(db.withTransaction).not.toHaveBeenCalled();
  });

  it('rejects an explicit tenant-switch header instead of trusting client tenant selection', () => {
    const guard = new TenantContextGuard();
    expect(() => guard.canActivate(contextFor({
      headers: { 'x-tenant-id': 'tenant-b' },
      principal: {
        userId: 'user-1',
        sessionId: 'session-1',
        tenantId: 'tenant-a',
        role: 'owner',
      },
    }))).toThrow('Workspace switching requires a newly issued tenant-scoped token');
  });

  it('allows a session revocation only when the session belongs to the authenticated user', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    };
    const jwt = { signAsync: jest.fn() };
    const config = { get: jest.fn() };
    const email = { sendVerificationEmail: jest.fn(), sendPasswordResetEmail: jest.fn() };
    const { AuthService } = await import('../src/auth/auth.service');
    const service = new AuthService(db as never, jwt as never, config as never, email as never);

    await expect(service.revokeSession('user-a', 'session-owned-by-user-b'))
      .rejects.toThrow('Session not found or already revoked');

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('id=$1 AND user_id=$2 AND revoked_at IS NULL'),
      ['session-owned-by-user-b', 'user-a'],
    );
  });
});
