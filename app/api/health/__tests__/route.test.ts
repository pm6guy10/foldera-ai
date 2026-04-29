import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function req(path = 'http://localhost/api/health') {
  return new NextRequest(new URL(path));
}

describe('GET /api/health', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('returns 200 JSON with db false when Supabase URL/key are missing (CI / local without DB)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.RESEND_API_KEY;

    const { GET } = await import('../route');
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.db).toBe(false);
    expect(body.depth).toBe('lite');
    expect(body.status).toBe('degraded');
    expect(body.schema).toBe('not_checked');
    expect(body.build).toBe('local');
    expect(body.revision).toEqual({
      git_sha: null,
      git_sha_short: null,
      git_ref: null,
      deployment_id: null,
      vercel_env: null,
    });
  });

  it('rejects full health without the cron/operator secret before running expensive probes', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';

    const { GET } = await import('../route');
    const res = await GET(req('http://localhost/api/health?depth=full'));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('allows full health with the cron/operator secret', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.RESEND_API_KEY;

    const { GET } = await import('../route');
    const res = await GET(
      new NextRequest(new URL('http://localhost/api/health?depth=full'), {
        headers: { Authorization: 'Bearer test-cron-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.depth).toBe('full');
    expect(body.schema).toBe('ok');
  });
});
