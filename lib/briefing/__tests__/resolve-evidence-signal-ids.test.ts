import { describe, expect, it, vi } from 'vitest';
import { resolveEvidenceSignalIdsForWinner } from '../resolve-evidence-signal-ids';
import type { ScoredLoop } from '../scorer';

function mockSupabase(commitmentRows: { id: string; source_id: string }[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: commitmentRows }),
  };
  return {
    from: vi.fn(() => chain),
  } as unknown as import('@/lib/db/client').SupabaseClient;
}

describe('resolveEvidenceSignalIdsForWinner', () => {
  it('maps commitment sourceSignals to tkg_commitments.source_id, not signal PK', async () => {
    const winner = {
      id: 'compound-a-b',
      type: 'compound',
      sourceSignals: [
        { kind: 'commitment' as const, id: 'commit-uuid-1' },
        { kind: 'signal' as const, id: 'signal-uuid-2' },
      ],
    } as unknown as ScoredLoop;

    const supabase = mockSupabase([{ id: 'commit-uuid-1', source_id: 'signal-from-mail' }]);
    const ids = await resolveEvidenceSignalIdsForWinner(supabase, 'user-1', winner);

    expect(ids).toContain('signal-from-mail');
    expect(ids).toContain('signal-uuid-2');
    expect(ids).not.toContain('commit-uuid-1');
  });

  it('puts originating signal first for commitment winners', async () => {
    const winner = {
      id: 'commit-uuid-1',
      type: 'commitment',
      sourceSignals: [{ kind: 'commitment' as const, id: 'commit-uuid-1' }],
    } as unknown as ScoredLoop;

    const supabase = mockSupabase([{ id: 'commit-uuid-1', source_id: 'orig-sig' }]);
    const ids = await resolveEvidenceSignalIdsForWinner(supabase, 'user-1', winner);

    expect(ids[0]).toBe('orig-sig');
  });

  it('ignores relationship source ids (entity PKs, not signal ids)', async () => {
    const winner = {
      id: 'rel-1',
      type: 'relationship',
      sourceSignals: [{ kind: 'relationship' as const, id: 'entity-uuid' }],
    } as unknown as ScoredLoop;

    const supabase = mockSupabase([]);
    const ids = await resolveEvidenceSignalIdsForWinner(supabase, 'user-1', winner);

    expect(ids).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
