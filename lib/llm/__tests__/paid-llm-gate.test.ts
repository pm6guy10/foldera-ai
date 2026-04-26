import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertPaidLlmAllowed, isPaidLlmAllowed, PaidLlmDisabledError } from '@/lib/llm/paid-llm-gate';

describe('paid-llm-gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows paid LLM in vitest without runtime spend env', () => {
    vi.stubEnv('VITEST', 'true');
    expect(isPaidLlmAllowed()).toBe(true);
  });

  it('blocks paid LLM outside production when ALLOW_PAID_LLM is unset', () => {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('ALLOW_PAID_LLM', '');
    expect(isPaidLlmAllowed()).toBe(false);
    expect(() => assertPaidLlmAllowed('test.scope')).toThrow(PaidLlmDisabledError);
  });

  it('allows paid LLM when ALLOW_PAID_LLM is explicitly enabled', () => {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('ALLOW_PAID_LLM', 'true');
    expect(isPaidLlmAllowed()).toBe(true);
    expect(() => assertPaidLlmAllowed('test.scope')).not.toThrow();
  });

  it('allows legacy vercel production paid path without extra env toggles', () => {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', '');
    vi.stubEnv('ALLOW_PAID_LLM', '');
    vi.stubEnv('ALLOW_PROD_PAID_LLM', '');
    expect(isPaidLlmAllowed()).toBe(true);
    expect(() => assertPaidLlmAllowed('test.scope')).not.toThrow();
  });

  it('blocks prod default dry-run unless ALLOW_PROD_PAID_LLM is enabled', () => {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    vi.stubEnv('ALLOW_PAID_LLM', '');
    vi.stubEnv('ALLOW_PROD_PAID_LLM', '');
    expect(isPaidLlmAllowed()).toBe(false);
    expect(() => assertPaidLlmAllowed('test.scope')).toThrow(PaidLlmDisabledError);
  });

  it('allows prod default dry-run when ALLOW_PROD_PAID_LLM is enabled', () => {
    vi.stubEnv('VITEST', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    vi.stubEnv('ALLOW_PAID_LLM', '');
    vi.stubEnv('ALLOW_PROD_PAID_LLM', 'true');
    expect(isPaidLlmAllowed()).toBe(true);
    expect(() => assertPaidLlmAllowed('test.scope')).not.toThrow();
  });
});
