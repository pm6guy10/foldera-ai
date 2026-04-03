import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductionCoreEnvOrThrow, getMissingProductionCoreEnv } from '../required-env';

describe('required-env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getMissingProductionCoreEnv lists unset core keys', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'x');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
    vi.stubEnv('ENCRYPTION_KEY', 'x');
    vi.stubEnv('NEXTAUTH_SECRET', 'x');
    expect(getMissingProductionCoreEnv()).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('assertProductionCoreEnvOrThrow is a no-op when not Vercel production', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(() => assertProductionCoreEnvOrThrow()).not.toThrow();
  });

  it('assertProductionCoreEnvOrThrow throws when production and core env missing', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('ENCRYPTION_KEY', '');
    vi.stubEnv('NEXTAUTH_SECRET', '');
    expect(() => assertProductionCoreEnvOrThrow()).toThrow(/Missing required production environment variables/);
  });
});
