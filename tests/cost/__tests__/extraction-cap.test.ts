import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Pass 3 (Master Audit #445, P0.1) — lock the extraction daily spend cap.
 *
 * The default was raised 4→ (from 0.25) on 2026-04-09 for a one-off backlog drain
 * and never reverted, leaving a 16x latent worst-case cost landmine. This test
 * pins the default back to 0.25 and proves the deliberate env override still works,
 * so the cap can never silently drift again.
 */

const MODULE = '@/lib/utils/api-tracker';

async function loadCap(envValue: string | undefined): Promise<number> {
  vi.resetModules();
  if (envValue === undefined) {
    vi.stubEnv('EXTRACTION_DAILY_CAP_USD', '');
  } else {
    vi.stubEnv('EXTRACTION_DAILY_CAP_USD', envValue);
  }
  const mod = await import(MODULE);
  return mod.EXTRACTION_DAILY_CAP as number;
}

describe('EXTRACTION_DAILY_CAP (Pass 3 P0.1, #445)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to 0.25 USD/day when no override is set', async () => {
    await expect(loadCap(undefined)).resolves.toBe(0.25);
  });

  it('honors a valid deliberate override (backlog catch-up)', async () => {
    await expect(loadCap('2')).resolves.toBe(2);
  });

  it('ignores an out-of-range override (>100) and falls back to the 0.25 default', async () => {
    await expect(loadCap('500')).resolves.toBe(0.25);
  });

  it('ignores a non-numeric override and falls back to the 0.25 default', async () => {
    await expect(loadCap('lots')).resolves.toBe(0.25);
  });
});
