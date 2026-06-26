import { describe, expect, it } from 'vitest';
import { computeCardPrecision } from '../card-precision';

type Row = { status?: string; execution_result: Record<string, unknown> };

/**
 * Minimal Supabase stub: every query in computeCardPrecision is
 * `from('tkg_actions').select().eq().eq('action_source', X).gte()` awaited.
 * The builder is thenable and resolves to the row set keyed by action_source.
 */
function makeSupabase(fired: Row[], responses: Row[]): any {
  return {
    from() {
      let source = '';
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'action_source') source = val;
          return builder;
        },
        gte: () => builder,
        then: (resolve: (v: { data: Row[] }) => unknown) => {
          const data = source === 'workday_presence_slack_send' ? fired : responses;
          return Promise.resolve({ data }).then(resolve);
        },
      };
      return builder;
    },
  };
}

const fired = (ts: string, slackOk = true): Row => ({
  execution_result: { slack_ok: slackOk, slack_ts: ts },
});
const response = (ts: string, status: 'approved' | 'draft_rejected'): Row => ({
  status,
  execution_result: { responded_to_slack_ts: ts },
});

const OPTS = { userId: 'u1', sinceIso: '2026-06-18T00:00:00Z' };

describe('computeCardPrecision', () => {
  it('counts acted / dismissed / ignored and computes precision', async () => {
    const supabase = makeSupabase(
      [fired('1'), fired('2'), fired('3')],
      [response('1', 'approved'), response('2', 'draft_rejected')],
    );
    const r = await computeCardPrecision(supabase, OPTS);
    expect(r).toEqual({ fired: 3, acted: 1, dismissed: 1, ignored: 1, precision: 1 / 3 });
  });

  it('returns null precision when no cards fired (never NaN)', async () => {
    const r = await computeCardPrecision(makeSupabase([], []), OPTS);
    expect(r).toEqual({ fired: 0, acted: 0, dismissed: 0, ignored: 0, precision: null });
  });

  it('excludes cards that never reached Slack (slack_ok=false)', async () => {
    const supabase = makeSupabase([fired('1'), fired('2', false)], [response('1', 'approved')]);
    const r = await computeCardPrecision(supabase, OPTS);
    expect(r).toEqual({ fired: 1, acted: 1, dismissed: 0, ignored: 0, precision: 1 });
  });

  it('a positive close is terminal — a later dismiss cannot downgrade it', async () => {
    const supabase = makeSupabase(
      [fired('1')],
      [response('1', 'approved'), response('1', 'draft_rejected')],
    );
    const r = await computeCardPrecision(supabase, OPTS);
    expect(r.acted).toBe(1);
    expect(r.dismissed).toBe(0);
  });

  it('dedups re-delivered cards sharing a ts', async () => {
    const supabase = makeSupabase([fired('1'), fired('1')], [response('1', 'approved')]);
    const r = await computeCardPrecision(supabase, OPTS);
    expect(r.fired).toBe(1);
    expect(r.acted).toBe(1);
  });
});
