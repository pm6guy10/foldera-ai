import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.db).toBe(false);
    expect(body.status).toBe('degraded');
    expect(body.build).toBe('local');
    expect(body.revision).toEqual({
      git_sha: null,
      git_sha_short: null,
      git_ref: null,
      deployment_id: null,
      vercel_env: null,
    });
  });
});
