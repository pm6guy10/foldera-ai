import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCronAuthenticated, resolveCronUser, validateCronAuth, resolveAnyUser } from '@/lib/auth/resolve-user';

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
const ORIGINAL_INGEST_USER_ID = process.env.INGEST_USER_ID;

const TEST_CRON_SECRET = 'test-cron-secret';
const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

function cronRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://foldera.ai/api/cron/health-check', { headers });
}

function restoreEnv() {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }

  if (ORIGINAL_INGEST_USER_ID === undefined) {
    delete process.env.INGEST_USER_ID;
  } else {
    process.env.INGEST_USER_ID = ORIGINAL_INGEST_USER_ID;
  }
}

afterEach(() => {
  restoreEnv();
});

describe('validateCronAuth', () => {
  it('accepts Authorization Bearer CRON_SECRET', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = cronRequest({
      authorization: `Bearer ${TEST_CRON_SECRET}`,
    });

    expect(validateCronAuth(request)).toBeNull();
  });

  it('accepts case-insensitive bearer with extra whitespace', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = cronRequest({
      authorization: `  bearer   ${TEST_CRON_SECRET}  `,
    });

    expect(validateCronAuth(request)).toBeNull();
  });

  it('accepts x-cron-secret header when Authorization is absent', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = cronRequest({
      'x-cron-secret': TEST_CRON_SECRET,
    });

    expect(validateCronAuth(request)).toBeNull();
  });

  it('rejects invalid secrets', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = cronRequest({
      authorization: 'Bearer wrong-secret',
      'x-cron-secret': 'wrong-secret',
    });

    const authErr = validateCronAuth(request);
    expect(authErr).not.toBeNull();
    expect(authErr?.status).toBe(401);
  });
});

describe('resolveCronUser', () => {
  it('resolves user from x-cron-secret contract', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    process.env.INGEST_USER_ID = TEST_USER_ID;

    const result = resolveCronUser(
      cronRequest({
        'x-cron-secret': TEST_CRON_SECRET,
      }),
    );

    expect('userId' in result && result.userId).toBe(TEST_USER_ID);
  });

  it('returns 500 when INGEST_USER_ID is missing even with valid cron auth', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    delete process.env.INGEST_USER_ID;

    const result = resolveCronUser(
      cronRequest({
        authorization: `Bearer ${TEST_CRON_SECRET}`,
      }),
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(500);
  });
});

describe('resolveAnyUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects x-as-user-id impersonation in production', async () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    process.env.INGEST_USER_ID = TEST_USER_ID;
    vi.stubEnv('VERCEL_ENV', 'production');

    const impersonatedUserId = '22222222-2222-2222-2222-222222222222';
    const request = cronRequest({
      'x-cron-secret': TEST_CRON_SECRET,
      'x-as-user-id': impersonatedUserId,
    });

    const result = await resolveAnyUser(request);

    // In production, impersonation should be disabled and return a 403 Response.
    // If it incorrectly succeeds, result will be { userId: impersonatedUserId }.
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it('still allows x-as-user-id impersonation on preview deployments (non-owner proof runs)', async () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    process.env.INGEST_USER_ID = TEST_USER_ID;
    vi.stubEnv('VERCEL_ENV', 'preview');

    const impersonatedUserId = '22222222-2222-2222-2222-222222222222';
    const request = cronRequest({
      'x-cron-secret': TEST_CRON_SECRET,
      'x-as-user-id': impersonatedUserId,
    });

    const result = await resolveAnyUser(request);

    expect(result).toEqual({ userId: impersonatedUserId });
  });
});

describe('isCronAuthenticated', () => {
  // #567 follow-on: a live incident showed the scheduled cron's seed calls compete with
  // the owner's interactive manual-call budget (lib/utils/api-tracker.ts) because nothing
  // distinguished "the scheduled system called this" from "a human clicked something" at
  // the point seedFromScorerForUser runs. isCronAuthenticated is that signal.
  it('is true for a valid Authorization Bearer CRON_SECRET', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = cronRequest({ authorization: `Bearer ${TEST_CRON_SECRET}` });

    expect(isCronAuthenticated(request)).toBe(true);
  });

  it('is true for a valid x-cron-secret header', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = cronRequest({ 'x-cron-secret': TEST_CRON_SECRET });

    expect(isCronAuthenticated(request)).toBe(true);
  });

  it('is false for a missing or wrong secret (never exempts an unauthenticated/interactive call)', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    expect(isCronAuthenticated(cronRequest())).toBe(false);
    expect(isCronAuthenticated(cronRequest({ authorization: 'Bearer wrong-secret' }))).toBe(false);
  });

  it('is false (fails closed, never throws) when CRON_SECRET is unconfigured', () => {
    delete process.env.CRON_SECRET;
    const request = cronRequest({ authorization: 'Bearer anything' });

    expect(() => isCronAuthenticated(request)).not.toThrow();
    expect(isCronAuthenticated(request)).toBe(false);
  });

  it('is false for a session-style request carrying no cron credentials at all', () => {
    process.env.CRON_SECRET = TEST_CRON_SECRET;
    const request = new Request('https://foldera.ai/api/workday-presence/seed-from-scorer', {
      headers: { cookie: 'next-auth.session-token=whatever' },
    });

    expect(isCronAuthenticated(request)).toBe(false);
  });
});
