import { describe, expect, it, vi } from 'vitest';
import {
  fetchBriefCycleLastAtMap,
  recordBriefCycleCheckpoint,
} from '@/lib/cron/brief-cycle-gate';

const SCHEMA_CACHE_MESSAGE =
  "Could not find the table 'public.user_brief_cycle_gates' in the schema cache";

describe('brief-cycle-gate — missing table (migration not applied)', () => {
  it('fetchBriefCycleLastAtMap returns all-null map and does not throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const from = vi.fn().mockReturnValue({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: null,
            error: { code: 'PGRST205', message: SCHEMA_CACHE_MESSAGE },
          }),
      }),
    });
    const supabase = { from } as any;

    const map = await fetchBriefCycleLastAtMap(supabase, ['u1', 'u2']);

    expect(map.get('u1')).toBeNull();
    expect(map.get('u2')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('recordBriefCycleCheckpoint no-ops with warning when table missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const upsert = vi.fn().mockResolvedValue({
      error: { code: 'PGRST205', message: SCHEMA_CACHE_MESSAGE },
    });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as any;

    await expect(recordBriefCycleCheckpoint(supabase, 'u1')).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('fetchBriefCycleLastAtMap still throws on unrelated DB errors', async () => {
    const from = vi.fn().mockReturnValue({
      select: () => ({
        in: () =>
          Promise.resolve({
            data: null,
            error: { code: 'XX000', message: 'some other failure' },
          }),
      }),
    });
    const supabase = { from } as any;

    await expect(fetchBriefCycleLastAtMap(supabase, ['u1'])).rejects.toMatchObject({
      message: 'some other failure',
    });
  });
});
