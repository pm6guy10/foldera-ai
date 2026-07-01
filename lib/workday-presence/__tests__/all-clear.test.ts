import { describe, expect, it, vi } from 'vitest';
import { loadAllClearEvidence } from '../all-clear';
import type { createServerClient } from '@/lib/db/client';

const NOW = '2026-07-01T17:00:00.000Z';

type RunRow = {
  outcome: string | null;
  completed_at: string | null;
  candidates_evaluated: number | null;
};

function supabaseWithLatestRun(row: RunRow | null, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
  };
  const from = vi.fn().mockReturnValue(chain);
  return { supabase: { from } as unknown as ReturnType<typeof createServerClient>, from, chain };
}

describe('loadAllClearEvidence — real numbers or nothing', () => {
  it('returns evidence for a fresh safe_silence run that surveyed a real field', async () => {
    const { supabase, from, chain } = supabaseWithLatestRun({
      outcome: 'safe_silence',
      completed_at: '2026-07-01T16:20:00.000Z',
      candidates_evaluated: 14,
    });

    const evidence = await loadAllClearEvidence(supabase, 'u-1', NOW);

    expect(from).toHaveBeenCalledWith('pipeline_runs');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u-1');
    expect(chain.eq).toHaveBeenCalledWith('phase', 'user_run');
    expect(evidence).toEqual({
      checked_count: 14,
      completed_at: '2026-07-01T16:20:00.000Z',
    });
  });

  it('refuses when the latest run seeded a winner — "nothing needs you" would be a lie', async () => {
    const { supabase } = supabaseWithLatestRun({
      outcome: 'seeded',
      completed_at: '2026-07-01T16:20:00.000Z',
      candidates_evaluated: 14,
    });
    expect(await loadAllClearEvidence(supabase, 'u-1', NOW)).toBeNull();
  });

  it('refuses a zero/unknown candidate count — never render "checked 0"', async () => {
    const { supabase } = supabaseWithLatestRun({
      outcome: 'safe_silence',
      completed_at: '2026-07-01T16:20:00.000Z',
      candidates_evaluated: 0,
    });
    expect(await loadAllClearEvidence(supabase, 'u-1', NOW)).toBeNull();

    const nullCount = supabaseWithLatestRun({
      outcome: 'safe_silence',
      completed_at: '2026-07-01T16:20:00.000Z',
      candidates_evaluated: null,
    });
    expect(await loadAllClearEvidence(nullCount.supabase, 'u-1', NOW)).toBeNull();
  });

  it('refuses stale evidence (older than 24h)', async () => {
    const { supabase } = supabaseWithLatestRun({
      outcome: 'safe_silence',
      completed_at: '2026-06-29T10:00:00.000Z',
      candidates_evaluated: 9,
    });
    expect(await loadAllClearEvidence(supabase, 'u-1', NOW)).toBeNull();
  });

  it('returns null on no rows or query error — evidence is a bonus, never a blocker', async () => {
    const noRows = supabaseWithLatestRun(null);
    expect(await loadAllClearEvidence(noRows.supabase, 'u-1', NOW)).toBeNull();

    const queryError = supabaseWithLatestRun(null, new Error('db down'));
    expect(await loadAllClearEvidence(queryError.supabase, 'u-1', NOW)).toBeNull();
  });

  it('never throws even when the client itself blows up', async () => {
    const broken = {
      from: () => {
        throw new Error('client exploded');
      },
    } as unknown as ReturnType<typeof createServerClient>;
    expect(await loadAllClearEvidence(broken, 'u-1', NOW)).toBeNull();
  });
});
