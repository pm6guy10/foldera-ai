import { describe, expect, it } from 'vitest';
import { buildBetaReadinessReport } from '../beta-readiness.ts';

type QueryResult = { data?: any; error?: any; count?: number | null };

function makeSupabaseStub(fixtures: {
  authUser: { id: string; email: string };
  subscriptionRow: null | { user_id: string; plan?: string; status?: string; current_period_end?: string };
  tokenRows: any[];
  signalsCount14: number;
  signalsCount30: number;
  latestActionRow: any | null;
}) {
  const state = {
    table: '',
    filters: [] as Array<{ k: string; op: string; v: any }>,
    selectArgs: null as null | { columns: string; opts?: any },
    orderBy: null as null | { column: string; ascending: boolean },
    limitN: null as null | number,
  };

  function reset() {
    state.table = '';
    state.filters = [];
    state.selectArgs = null;
    state.orderBy = null;
    state.limitN = null;
  }

  async function exec(): Promise<QueryResult> {
    const table = state.table;

    if (table === 'user_subscriptions') {
      reset();
      return { data: fixtures.subscriptionRow, error: null };
    }

    if (table === 'user_tokens') {
      reset();
      return { data: fixtures.tokenRows, error: null };
    }

    if (table === 'tkg_signals') {
      const gte = state.filters.find((f) => f.k === 'occurred_at' && f.op === 'gte')?.v as string | undefined;
      const is14 = typeof gte === 'string' && gte.includes('T') && new Date().getTime() - new Date(gte).getTime() < 20 * 86400000;
      const count = is14 ? fixtures.signalsCount14 : fixtures.signalsCount30;
      reset();
      return { data: null, error: null, count };
    }

    if (table === 'tkg_actions') {
      reset();
      return { data: fixtures.latestActionRow, error: null };
    }

    reset();
    return { data: null, error: null };
  }

  const builder = {
    select(columns: string, opts?: any) {
      state.selectArgs = { columns, opts };
      return builder;
    },
    eq(k: string, v: any) {
      state.filters.push({ k, op: 'eq', v });
      return builder;
    },
    not(k: string, op: string, v: any) {
      state.filters.push({ k, op: `not.${op}`, v });
      return builder;
    },
    is(k: string, v: any) {
      state.filters.push({ k, op: 'is', v });
      return builder;
    },
    or(_expr: string) {
      return builder;
    },
    gte(k: string, v: any) {
      state.filters.push({ k, op: 'gte', v });
      return builder;
    },
    order(column: string, opts: { ascending: boolean }) {
      state.orderBy = { column, ascending: opts.ascending };
      return builder;
    },
    limit(n: number) {
      state.limitN = n;
      return builder;
    },
    async maybeSingle() {
      const res = await exec();
      return { data: res.data ?? null, error: res.error ?? null, count: res.count ?? null };
    },
  };

  return {
    rpc: async (fn: string, _args: any) => {
      if (fn !== 'get_auth_user_id_by_email') return { data: null, error: { message: 'unknown_rpc' } };
      return { data: fixtures.authUser.id, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          if (id !== fixtures.authUser.id) return { data: { user: null }, error: { message: 'not_found' } };
          return { data: { user: fixtures.authUser }, error: null };
        },
      },
    },
    from: (table: string) => {
      state.table = table;
      return builder;
    },
  };
}

describe('buildBetaReadinessReport', () => {
  it('returns READY when all readiness rules pass', async () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const supabase = makeSupabaseStub({
      authUser: { id: userId, email: 'beta.user@example.com' },
      subscriptionRow: { user_id: userId, plan: 'trial', status: 'active', current_period_end: new Date().toISOString() },
      tokenRows: [
        {
          provider: 'google',
          email: 'beta.user@example.com',
          scopes: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          last_synced_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          access_token: 'x',
          refresh_token: 'y',
          disconnected_at: null,
          oauth_reauth_required_at: null,
        },
      ],
      signalsCount14: 10,
      signalsCount30: 25,
      latestActionRow: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        directive_text: 'Send the update email to close the open loop.',
        action_type: 'send_message',
        confidence: 80,
        reason: 'Recent inbound messages indicate a pending decision.',
        evidence: [{ type: 'signal', description: 'Email thread', date: '2026-04-10' }],
        status: 'pending_approval',
        generated_at: new Date().toISOString(),
        artifact: {
          type: 'email',
          to: 'someone.else@example.com',
          subject: 'Quick follow-up on the proposal',
          body: 'Following up with the concrete next step and a clear ask tied to the thread.',
          draft_type: 'email_compose',
        },
        execution_result: { generation_log: {} },
      },
    }) as any;

    const report = await buildBetaReadinessReport('beta.user@example.com', { supabase });
    expect(report.verdict).toBe('READY');
    expect(report.blockers).toEqual([]);
    expect(report.user_exists).toBe(true);
    expect(report.account_exists).toBe(true);
    expect(report.connected_providers).toEqual(['google']);
    expect(report.latest_artifact_valid).toBe(true);
  });

  it('returns NOT_READY with exact blockers when key gates fail', async () => {
    const userId = '33333333-3333-3333-3333-333333333333';
    const supabase = makeSupabaseStub({
      authUser: { id: userId, email: 'stuck.user@example.com' },
      subscriptionRow: null,
      tokenRows: [
        {
          provider: 'microsoft',
          email: 'stuck.user@example.com',
          scopes: 'openid profile email user.read', // missing mail/calendar/offline
          last_synced_at: null,
          access_token: 'x',
          refresh_token: null,
          disconnected_at: null,
          oauth_reauth_required_at: null,
        },
      ],
      signalsCount14: 0,
      signalsCount30: 0,
      latestActionRow: null,
    }) as any;

    const report = await buildBetaReadinessReport('stuck.user@example.com', { supabase });
    expect(report.verdict).toBe('NOT_READY');
    expect(report.blockers).toContain('account_missing (no user_subscriptions row)');
    expect(report.blockers).toContain('provider_auth_invalid (no connected provider with valid refresh/auth)');
    expect(report.blockers).toContain('provider_missing_scopes');
    expect(report.blockers).toContain('no_recent_signals_30d');
    expect(report.blockers).toContain('no_directive (no tkg_actions rows)');
  });
});
