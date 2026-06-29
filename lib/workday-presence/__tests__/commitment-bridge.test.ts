import { describe, expect, it, vi } from 'vitest';
import { findLapsingCommitmentSignal, humanCommitmentTitle } from '../commitment-bridge';

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

  it('prefers the human description over the canonical dedup key (#399)', async () => {
    // canonical_form is the SYNC:<category>:<slug> dedup KEY (signal-processor.ts),
    // never a display title. Real data looks like this — the card must show the
    // human description, not the machine key.
    const supabase = makeSupabaseStub([
      {
        id: 'commit-2',
        description: 'Reply to Acme renewal question',
        canonical_form: 'SYNC:relationship:Reply_to_Acme_renewal_question',
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
    expect(result?.title).not.toContain('SYNC:');
    expect(result?.due_at_iso).toBe('2026-06-16T18:00:00.000Z');
  });

  it('cleans a SYNC: key into a human title when description is missing (#399)', async () => {
    const supabase = makeSupabaseStub([
      {
        id: 'commit-3',
        description: null,
        canonical_form: 'SYNC:payment_financial:Pay_the_Supabase_invoice',
        due_at: '2026-06-16T20:00:00.000Z',
        implied_due_at: null,
      },
    ]);

    const result = await findLapsingCommitmentSignal(
      supabase as any,
      'user-1',
      '2026-06-16T12:00:00.000Z',
    );

    expect(result?.title).toBe('Pay the Supabase invoice');
    expect(result?.title).not.toContain('SYNC:');
  });

  it('bounds the query to a 30-day staleness floor so year-old overdue items are excluded', async () => {
    const supabase = makeSupabaseStub([]);
    const nowIso = '2026-06-29T12:00:00.000Z';
    await findLapsingCommitmentSignal(supabase as any, 'user-1', nowIso);

    // The floor is now - 30d; year-old 2025 due dates fall below it and cannot match.
    const orArg = (supabase._spies.or.mock.calls[0]?.[0] ?? '') as string;
    expect(orArg).toContain('due_at.gte.2026-05-30T12:00:00.000Z');
    expect(orArg).toContain('implied_due_at.gte.2026-05-30T12:00:00.000Z');
    expect(orArg).toContain('due_at.lte.2026-06-30T12:00:00.000Z');
    // Soonest-first ordering — the item nearing lapse wins, not the most ancient.
    expect(supabase._spies.order).toHaveBeenCalledWith('due_at', { ascending: false, nullsFirst: false });
  });

  it('throws when the query errors instead of silently returning null', async () => {
    const supabase = makeSupabaseStub([], new Error('db unreachable'));
    await expect(
      findLapsingCommitmentSignal(supabase as any, 'user-1', '2026-06-16T12:00:00.000Z'),
    ).rejects.toThrow('db unreachable');
  });
});

describe('humanCommitmentTitle (#399)', () => {
  it('prefers the human description', () => {
    expect(
      humanCommitmentTitle('Pay the Supabase invoice', 'SYNC:payment_financial:Pay_the_Supabase_invoice'),
    ).toBe('Pay the Supabase invoice');
  });

  it('strips the SYNC: prefix and restores spaces when only the key exists', () => {
    expect(humanCommitmentTitle(null, 'SYNC:payment_financial:Pay_the_Supabase_invoice')).toBe(
      'Pay the Supabase invoice',
    );
    expect(humanCommitmentTitle('   ', 'SYNC:other:Reply_to_Deanne')).toBe('Reply to Deanne');
  });

  it('returns null when neither a description nor a usable key exists', () => {
    expect(humanCommitmentTitle(null, null)).toBeNull();
    expect(humanCommitmentTitle('', 'SYNC:payment_financial:')).toBeNull();
  });
});
