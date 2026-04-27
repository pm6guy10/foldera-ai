import { afterEach, describe, expect, it } from 'vitest';
import { resolveCronUser, validateCronAuth } from '@/lib/auth/resolve-user';

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
