import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MAIL_CURSOR_HEAL_GAP_MS } from '@/lib/config/constants';
import { healMailCursorAfterIncrementalEmpty } from '../mail-cursor-heal';

const baseArgs = {
  provider: 'google' as const,
  mailSource: 'gmail' as const,
  logTag: '[google-sync]',
};

function makeSupabase(opts: {
  maxOccurredAt: string | null;
  lastSyncedAt: string | null;
  updateError?: { message: string } | null;
}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'tkg_signals') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: opts.maxOccurredAt ? { occurred_at: opts.maxOccurredAt } : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'user_tokens') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.lastSyncedAt ? { last_synced_at: opts.lastSyncedAt } : null,
                error: null,
              }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return {
            eq: () => ({
              eq: async () => ({ error: opts.updateError ?? null }),
            }),
          };
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from, updatePayloads };
}

describe('healMailCursorAfterIncrementalEmpty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips when first sync', async () => {
    const { from } = makeSupabase({
      maxOccurredAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: '2026-04-07T12:00:00.000Z',
    });
    const r = await healMailCursorAfterIncrementalEmpty({ from } as any, 'u1', {
      ...baseArgs,
      mailSignalsInserted: 0,
      isFirstSync: true,
    });
    expect(r.rewound).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('skips when mail signals were inserted this run', async () => {
    const { from } = makeSupabase({
      maxOccurredAt: '2026-01-01T00:00:00.000Z',
      lastSyncedAt: '2026-04-07T12:00:00.000Z',
    });
    const r = await healMailCursorAfterIncrementalEmpty({ from } as any, 'u1', {
      ...baseArgs,
      mailSignalsInserted: 3,
      isFirstSync: false,
    });
    expect(r.rewound).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('skips when there is no mail signal row for that source', async () => {
    const { from } = makeSupabase({
      maxOccurredAt: null,
      lastSyncedAt: '2026-04-07T12:00:00.000Z',
    });
    const r = await healMailCursorAfterIncrementalEmpty({ from } as any, 'u1', {
      ...baseArgs,
      mailSignalsInserted: 0,
      isFirstSync: false,
    });
    expect(r.rewound).toBe(false);
    expect(from).toHaveBeenCalledWith('tkg_signals');
  });

  it('skips when cursor is not far enough ahead of newest occurred_at', async () => {
    const { from, updatePayloads } = makeSupabase({
      maxOccurredAt: '2026-04-07T10:00:00.000Z',
      lastSyncedAt: '2026-04-07T14:00:00.000Z',
    });
    const r = await healMailCursorAfterIncrementalEmpty({ from } as any, 'u1', {
      ...baseArgs,
      mailSignalsInserted: 0,
      isFirstSync: false,
    });
    expect(r.rewound).toBe(false);
    expect(updatePayloads).toHaveLength(0);
  });

  it('rewinds when gap exceeds MAIL_CURSOR_HEAL_GAP_MS and zero inserts', async () => {
    const maxAt = '2026-04-05T12:00:00.000Z';
    const cursorAt = '2026-04-07T14:00:00.000Z';
    expect(new Date(cursorAt).getTime() - new Date(maxAt).getTime()).toBeGreaterThan(MAIL_CURSOR_HEAL_GAP_MS);

    const { from, updatePayloads } = makeSupabase({
      maxOccurredAt: maxAt,
      lastSyncedAt: cursorAt,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const r = await healMailCursorAfterIncrementalEmpty({ from } as any, 'user-xyz', {
      ...baseArgs,
      mailSignalsInserted: 0,
      isFirstSync: false,
    });

    expect(r.rewound).toBe(true);
    expect(r.oldCursor).toBe(cursorAt);
    expect(r.newCursor).toBe(maxAt);
    expect(r.gapHours).toBeGreaterThan(24);
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({ last_synced_at: maxAt });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('CURSOR_REWOUND'),
    );
    expect(logSpy.mock.calls[0][0]).toContain('user-xyz');
    expect(logSpy.mock.calls[0][0]).toContain('provider=google');
    expect(logSpy.mock.calls[0][0]).toContain('source=gmail');

    logSpy.mockRestore();
  });

  it('does not rewind when update fails', async () => {
    const { from, updatePayloads } = makeSupabase({
      maxOccurredAt: '2026-04-05T12:00:00.000Z',
      lastSyncedAt: '2026-04-07T14:00:00.000Z',
      updateError: { message: 'rls' },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const r = await healMailCursorAfterIncrementalEmpty({ from } as any, 'u1', {
      ...baseArgs,
      mailSignalsInserted: 0,
      isFirstSync: false,
    });

    expect(r.rewound).toBe(false);
    expect(updatePayloads).toHaveLength(1);
  });
});
