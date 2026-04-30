import { beforeEach, describe, expect, it, vi } from 'vitest';

const signalSelectCalls: string[] = [];

type ActionRow = {
  id: string;
  directive_text: string;
  action_type: string;
  status: string;
  generated_at: string;
  executed_at: string | null;
  outcome_closed: boolean;
  feedback_weight: number;
  execution_result?: Record<string, unknown>;
  skip_reason?: string | null;
};

type SignalRow = {
  id: string;
  source: string;
  type: string;
  occurred_at: string;
  author: string;
  source_id: string;
  recipients?: string[];
  extracted_entities?: string[];
  extracted_commitments?: string[];
  extracted_dates?: string[];
  extracted_amounts?: string[];
  outcome_label?: string | null;
  processed?: boolean;
};

const nowIso = '2026-04-21T12:00:00.000Z';

let actionRows: ActionRow[] = [];
let signalRows: SignalRow[] = [];

function makeBuilder(data: unknown) {
  const builder: Record<string, unknown> & { then: (resolve: (value: unknown) => void) => void } = {
    eq() { return builder; },
    neq() { return builder; },
    gt() { return builder; },
    gte() { return builder; },
    lt() { return builder; },
    lte() { return builder; },
    in() { return builder; },
    is() { return builder; },
    not() { return builder; },
    or() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    then(resolve: (value: unknown) => void) {
      resolve({ data, error: null });
    },
  };

  return builder;
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      return {
        select(columns?: string) {
          if (table === 'tkg_signals') {
            signalSelectCalls.push(String(columns ?? ''));
            return makeBuilder(signalRows);
          }
          if (table === 'tkg_actions') return makeBuilder(actionRows);
          if (table === 'tkg_goals') {
            return makeBuilder([
              {
                goal_text: 'Land the MAS3 role',
                priority: 5,
                goal_category: 'career',
                source: 'onboarding',
                status: 'active',
              },
            ]);
          }
          if (table === 'tkg_commitments') return makeBuilder([]);
          if (table === 'tkg_entities') return makeBuilder([]);
          if (table === 'tkg_constraints') return makeBuilder([]);
          if (table === 'user_tokens') return makeBuilder([]);
          if (table === 'tkg_directive_ml_snapshots') return makeBuilder([]);
          if (table === 'tkg_directive_ml_global_priors') return makeBuilder([]);
          if (table === 'tkg_entity_aliases') return makeBuilder([]);
          return makeBuilder([]);
        },
      };
    },
    auth: {
      admin: {
        getUserById: async (userId: string) => ({
          data: {
            user: {
              id: userId,
              email: 'owner@example.com',
              user_metadata: { full_name: 'Owner Example' },
              identities: [],
            },
          },
          error: null,
        }),
      },
    },
  }),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: vi.fn(),
}));

describe('scorer metadata-first tkg_signals reads', () => {
  beforeEach(() => {
    vi.resetModules();
    signalSelectCalls.length = 0;
    actionRows = Array.from({ length: 5 }, (_unused, index) => ({
      id: `action-${index + 1}`,
      directive_text: `Approved action ${index + 1}`,
      action_type: 'send_message',
      status: 'approved',
      generated_at: nowIso,
      executed_at: nowIso,
      outcome_closed: false,
      feedback_weight: 1,
      execution_result: {},
      skip_reason: null,
    }));
    signalRows = Array.from({ length: 20 }, (_unused, index) => ({
      id: `signal-${index + 1}`,
      source: index % 2 === 0 ? 'gmail' : 'outlook_calendar',
      type: index % 2 === 0 ? 'email_received' : 'calendar_event',
      occurred_at: new Date(Date.parse(nowIso) - index * 60 * 60 * 1000).toISOString(),
      author: index % 2 === 0
        ? `Alex Rivera <alex${index}@clientco.com>`
        : 'Hiring Team <hiring@example.com>',
      source_id: `src-${index + 1}`,
      recipients: ['owner@example.com'],
      extracted_entities: index % 2 === 0 ? ['Alex Rivera', 'ClientCo'] : ['Hiring Team'],
      extracted_commitments: index % 2 === 0 ? ['Contract packet due Friday'] : ['Interview confirmed next week'],
      extracted_dates: ['2026-04-24'],
      extracted_amounts: [],
      outcome_label: null,
      processed: true,
    }));
  });

  it('keeps discovery helpers and scoreOpenLoops metadata-only for tkg_signals', async () => {
    const {
      detectAntiPatterns,
      detectEmergentPatterns,
      enrichRelationshipContext,
      inferRevealedGoals,
      scoreOpenLoops,
    } = await import('../scorer');

    await enrichRelationshipContext('user-1', 'Alex Rivera', null);
    await inferRevealedGoals('user-1');
    await detectAntiPatterns('user-1');
    await detectEmergentPatterns('user-1');
    await scoreOpenLoops('user-1', { pipelineDryRun: true });

    expect(signalSelectCalls.length).toBeGreaterThan(0);
    expect(signalSelectCalls.every((columns) => !/\bcontent\b/.test(columns))).toBe(true);
    expect(signalSelectCalls).toEqual(expect.arrayContaining([
      'id, source, occurred_at, author, type, source_id',
      'id, source, type, occurred_at, author, source_id',
      'id, occurred_at, source, type',
      'id, user_id, source, source_id, type, author, recipients, occurred_at, extracted_entities, extracted_commitments, extracted_dates, extracted_amounts, outcome_label, processed',
    ]));
  });
});
