import { describe, expect, it, vi } from 'vitest';
import { findLapsingCommitmentSignal } from '../commitment-bridge';

function makeSupabaseStub(rows: unknown[], error: unknown = null) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error });
  const order = vi.fn().mockReturnValue({ limit });
  const or = vi.fn().mockReturnValue({ order });
  const is = vi.fn().mockReturnValue({ or });
  const eqStatus = vi.fn().mockReturnValue({ is });
  const eqUser = vi.fn().mockReturnValue({ eq: eqStatus });
  const select = vi.fn().mockReturnValue({ eq: eqUser });
  const from = vi.fn().mockReturnValue({ select });
  return { from, _spies: { from, select, eqUser, eqStatus, is, or, order, limit } };
}

describe('findLapsingCommitmentSignal', () => {
  it('returns null when nothing is due soon', async () => {
    const supabase = makeSupabaseStub([]);
    const result = await findLapsingCommitmentSignal(
      supabase as any,
      'user-1',
      '2026-06-16T12:00:00.000Z',
    );
    expect(result).toBeNull();
    expect(supabase._spies.from).toHaveBeenCalledWith('tkg_commitments');
  });

  it('synthesizes a calendar/commitment_lapsing signal from a real due-soon commitment', async () => {
    const supabase = makeSupabaseStub([
      {
        id: 'commit-1',
        description: 'Send the Q3 budget revision to finance',
        canonical_form: null,
        due_at: '2026-06-17T09:00:00.000Z',
        implied_due_at: null,
      },
    ]);

    const result = await findLapsingCommitmentSignal(
      supabase as any,
      'user-1',
      '2026-06-16T12:00:00.000Z',
    );

    expect(result).toEqual({
      id: 'commit-1',
      source: 'calendar',
      title: 'Send the Q3 budget revision to finance',
      starts_at_iso: '2026-06-17T09:00:00.000Z',
      due_at_iso: '2026-06-17T09:00:00.000Z',
      commitment_lapsing: true,
    });
  });

  it('prefers canonical_form over description when both exist', async () => {
    const supabase = makeSupabaseStub([
      {
        id: 'commit-2',
        description: 'raw extracted text, less clean',
        canonical_form: 'Reply to Acme renewal question',
        due_at: null,
        implied_due_at: '2026-06-16T18:00:00.000Z',
      },
    ]);

    const result = await findLapsingCommitmentSignal(
      supabase as any,
      'user-1',
      '2026-06-16T12:00:00.000Z',
    );

    expect(result?.title).toBe('Reply to Acme renewal question');
    expect(result?.due_at_iso).toBe('2026-06-16T18:00:00.000Z');
  });

  it('throws when the query errors instead of silently returning null', async () => {
    const supabase = makeSupabaseStub([], new Error('db unreachable'));
    await expect(
      findLapsingCommitmentSignal(supabase as any, 'user-1', '2026-06-16T12:00:00.000Z'),
    ).rejects.toThrow('db unreachable');
  });
});
