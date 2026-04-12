import { describe, expect, it, vi } from 'vitest';
import * as dbClient from '@/lib/db/client';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { getSubscriptionStatus } from '@/lib/auth/subscription';
import { filterDailyBriefEligibleUserIds } from '@/lib/auth/daily-brief-users';
import * as userTokens from '@/lib/auth/user-tokens';
import * as scorer from '@/lib/briefing/scorer';
import type { ScorerResult } from '@/lib/briefing/scorer';
import { SCORER_STATIC_DUPLICATE_STOPWORDS } from '@/lib/briefing/scorer';
import {
  buildUserIdentityContext,
  buildPromptFromStructuredContext,
  generateDirective,
  type StructuredContext,
} from '@/lib/briefing/generator';

/** Mirrors email-local extraction used for display-name fallback. */
function longestEmailLocalToken(local: string): string | null {
  const segments = local.split(/[.\-]+/).filter(Boolean);
  let best: string | null = null;
  let bestLen = 0;
  for (const seg of segments) {
    const alpha = seg.replace(/\d+$/, '').toLowerCase();
    if (alpha.length >= 3 && alpha.length >= bestLen) {
      if (alpha.length > bestLen) {
        bestLen = alpha.length;
        best = alpha;
      }
    }
  }
  return best;
}

const FAKE_USER_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
const RANDOM_UUID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const COMMON_FIRST_NAMES = [
  'brandon',
  'sarah',
  'michael',
  'jennifer',
  'david',
  'ashley',
  'james',
  'nicole',
];

describe('multi-user safety', () => {
  describe('email local self-token extraction', () => {
    it('picks longest segment after stripping trailing digits', () => {
      expect(longestEmailLocalToken('b.kapp1010')).toBe('kapp');
    });

    it('uses first segment when lengths tie', () => {
      expect(longestEmailLocalToken('jane.doe')).toBe('jane');
    });

    it('returns null when no segment reaches 3+ alpha chars', () => {
      expect(longestEmailLocalToken('a.b')).toBeNull();
    });
  });

  it('getSubscriptionStatus returns none for unknown user without throwing', async () => {
    const spy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    } as ReturnType<typeof dbClient.createServerClient>);

    try {
      const r = await getSubscriptionStatus(FAKE_USER_ID);
      expect(r.status).toBe('none');
      expect(r.plan).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('getSubscriptionStatus with OWNER_USER_ID returns active from a real pro row shape (no code bypass)', async () => {
    const spy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  {
                    plan: 'pro',
                    status: 'active',
                    current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
                    stripe_customer_id: 'cus_test',
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    } as ReturnType<typeof dbClient.createServerClient>);
    try {
      const r = await getSubscriptionStatus(OWNER_USER_ID);
      expect(r.status).toBe('active');
      expect(r.plan).toBe('pro');
    } finally {
      spy.mockRestore();
    }
  });

  it('getSubscriptionStatus uses the first row when the client returns multiple (defensive)', async () => {
    const spy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({
                data: [
                  {
                    plan: 'trial',
                    status: 'active',
                    current_period_end: new Date(Date.now() + 7 * 864e5).toISOString(),
                    stripe_customer_id: null,
                  },
                  {
                    plan: 'pro',
                    status: 'active',
                    current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
                    stripe_customer_id: 'cus_other',
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    } as ReturnType<typeof dbClient.createServerClient>);
    try {
      const r = await getSubscriptionStatus(FAKE_USER_ID);
      expect(r.status).toBe('active_trial');
      expect(r.plan).toBe('trial');
    } finally {
      spy.mockRestore();
    }
  });

  it('filterDailyBriefEligibleUserIds: owner with active subscription passes; random uuid without sub and not connected is excluded', async () => {
    const fromSpy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: (table: string) => {
        if (table === 'user_subscriptions') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ user_id: OWNER_USER_ID, plan: 'pro', status: 'active' }],
                  error: null,
                }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    } as unknown as ReturnType<typeof dbClient.createServerClient>);
    const listSpy = vi
      .spyOn(userTokens, 'listConnectedUserIds')
      .mockResolvedValue(new Set([OWNER_USER_ID]));
    try {
      const out = await filterDailyBriefEligibleUserIds([OWNER_USER_ID, RANDOM_UUID]);
      expect(out).toEqual([OWNER_USER_ID]);
    } finally {
      fromSpy.mockRestore();
      listSpy.mockRestore();
    }
  });

  it('buildUserIdentityContext with empty goals returns null', () => {
    expect(buildUserIdentityContext([])).toBeNull();
  });

  it('SCORER_STATIC_DUPLICATE_STOPWORDS has no hardcoded personal first names', () => {
    for (const name of COMMON_FIRST_NAMES) {
      expect(SCORER_STATIC_DUPLICATE_STOPWORDS.has(name)).toBe(false);
    }
  });

  it('buildPromptFromStructuredContext send path avoids hardcoded legacy account names for generic user', () => {
    const ctx = {
      has_real_recipient: true,
      recipient_brief: 'Alex Person <alex@example.com>',
      supporting_signals: [],
      already_sent_14d: [],
      recent_action_history_7d: [],
      confidence_prior: 75,
      user_full_name: 'the user',
      user_first_name: '',
    } as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx, 'send_message');
    expect(prompt).not.toMatch(/Brandon/i);
    expect(prompt).not.toMatch(/Cheryl/i);
    expect(prompt).toContain('the user');
  });

  it('buildPromptFromStructuredContext long path places LOCKED_CONTACTS after CANDIDATE_ANALYSIS when set', () => {
    const base = {
      has_real_recipient: false,
      recipient_brief: null,
      trigger_context: null,
      candidate_title: 'Test candidate',
      candidate_class: 'commitment',
      selected_candidate: 'Do the thing.',
      candidate_reason: 'reason',
      candidate_goal: null,
      candidate_score: 3,
      candidate_due_date: null,
      candidate_context_enrichment: null,
      supporting_signals: [],
      surgical_raw_facts: [],
      active_goals: [],
      locked_constraints: null,
      locked_contacts_prompt: '- long path locked entity',
      recent_action_history_7d: [],
      has_real_target: true,
      has_recent_evidence: true,
      already_acted_recently: false,
      decision_already_made: false,
      can_execute_without_editing: true,
      has_due_date_or_time_anchor: false,
      conflicts_with_locked_constraints: false,
      constraint_violation_codes: [],
      researcher_insight: null,
      user_identity_context: null,
      user_full_name: 'Test User',
      user_first_name: 'Test',
      goal_gap_analysis: [],
      already_sent_14d: [],
      behavioral_mirrors: [],
      conviction_math: null,
      behavioral_history: null,
      avoidance_observations: [],
      relationship_timeline: null,
      competition_context: null,
      confidence_prior: 70,
      required_causal_diagnosis: { why_exists_now: 'deadline pressure', mechanism: 'stalled work' },
      discrepancy_class: null,
      candidate_analysis: 'CANDIDATE_ANALYSIS: stakes=1',
      entity_analysis: null,
      entity_conversation_state: null,
      user_voice_patterns: null,
    };
    const ctx = base as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx, 'write_document');
    const idxLocked = prompt.indexOf('LOCKED_CONTACTS (never mention these in any artifact)');
    const idxAnalysis = prompt.indexOf('CANDIDATE_ANALYSIS');
    expect(idxLocked).toBeGreaterThan(-1);
    expect(idxAnalysis).toBeGreaterThan(-1);
    expect(idxLocked).toBeGreaterThan(idxAnalysis);
    expect(prompt).toContain('- long path locked entity');
  });

  it('buildPromptFromStructuredContext recipient-short path injects LOCKED_CONTACTS when locked_contacts_prompt is set', () => {
    const ctx = {
      has_real_recipient: true,
      recipient_brief: 'Alex Person <alex@example.com>',
      locked_contacts_prompt: '- do not surface this person',
      supporting_signals: [],
      already_sent_14d: [],
      recent_action_history_7d: [],
      confidence_prior: 75,
      user_full_name: 'the user',
      user_first_name: '',
    } as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx, 'send_message');
    expect(prompt).toContain('LOCKED_CONTACTS (never mention these in any artifact)');
    expect(prompt).toContain('- do not surface this person');
  });

  it('buildPromptFromStructuredContext decay discrepancy short path keeps rich context without full convergent stack', () => {
    const userIdentity = buildUserIdentityContext([
      { goal_text: 'Advance two DSHS job applications', priority: 5, goal_category: 'career' },
    ]);
    expect(userIdentity).toContain('internal briefing');
    expect(userIdentity).toContain('evidence-aligned connections');

    const ctx = {
      has_real_recipient: true,
      recipient_brief: 'Cheryl Anderson <cheryl@example.com>',
      candidate_class: 'discrepancy',
      discrepancy_class: 'decay',
      candidate_title: 'Relationship cooling: Cheryl Anderson',
      selected_candidate: 'Prior thread went quiet after Q4 planning; silence is the structural signal.',
      candidate_context_enrichment: null,
      candidate_analysis:
        'CANDIDATE_ANALYSIS (scorer rationale — internal grounding; do not dump raw metrics into the user-facing email):\n- aggregate_score: 4.20',
      entity_analysis:
        'ENTITY_ANALYSIS (behavioral graph / bx_stats — internal context for relationship dynamics):\n- velocity_ratio: 0.35',
      supporting_signals: [
        {
          source: 'gmail',
          occurred_at: '2026-01-15',
          entity: 'cheryl@example.com',
          summary: 'Q4 planning thread',
          direction: 'received',
        },
        {
          source: 'gmail',
          occurred_at: '2026-01-10',
          entity: 'outlook_calendar',
          summary: 'Follow-up meeting invite',
          direction: 'unknown',
        },
      ],
      avoidance_observations: [
        { type: 'no_reply_sent' as const, severity: 'medium' as const, observation: 'No outbound reply to last inbound from Cheryl in 12d.' },
      ],
      behavioral_mirrors: ['[SIGNAL_VELOCITY] Test mirror line.'],
      response_pattern_lines: [
        '- [2026-01-11] [response_pattern] cheryl@example.com: Unreplied inbound thread 9d',
      ],
      already_sent_14d: [],
      recent_action_history_7d: [],
      confidence_prior: 75,
      user_full_name: 'Test User',
      user_first_name: 'Test',
      trigger_context: 'TRIGGER_CONTEXT (decay):\nDelta: prior engagement cooled.',
      user_identity_context: userIdentity,
      active_goals: ['[career, p5] Advance two DSHS job applications'],
      goal_gap_analysis: [
        {
          goal_text: 'Advance two DSHS job applications',
          priority: 5,
          category: 'career',
          signal_count_14d: 2,
          signal_count_30d: 4,
          signal_count_90d: 9,
          action_count_14d: 0,
          commitment_count: 0,
          gap_level: 'MEDIUM' as const,
          gap_description: 'Inbound employer-related mail but sparse outbound follow-up.',
        },
      ],
      locked_contacts_prompt: '- locked example entity',
    } as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx, 'send_message');
    expect(prompt).toContain('LOCKED_CONTACTS (never mention these in any artifact)');
    expect(prompt).toContain('- locked example entity');
    expect(prompt).toContain('CANONICAL_ACTION');
    expect(prompt).toContain('Write an email from the user to:');
    expect(prompt).toContain('USER CONTEXT');
    expect(prompt).toContain('GOAL_GAP_ANALYSIS');
    expect(prompt).toContain('ACTIVE_GOALS');
    expect(prompt).toContain('Advance two DSHS job applications');
    expect(prompt).toContain('DECAY_RECONNECTION_RULE');
    expect(prompt).toContain('CANDIDATE_EVIDENCE');
    expect(prompt).toContain('CANDIDATE_ANALYSIS');
    expect(prompt).toContain('ENTITY_ANALYSIS');
    expect(prompt).toContain('SUPPORTING_SIGNALS');
    expect(prompt).toContain('AVOIDANCE_SIGNALS');
    expect(prompt).toContain('BEHAVIORAL_MIRROR');
    expect(prompt).toContain('RESPONSE_PATTERN_LINES');
    expect(prompt).toContain('[response_pattern]');
    expect(prompt).toContain('velocity_ratio');
    expect(prompt).not.toContain('CONVERGENT_ANALYSIS');
    expect(prompt).not.toContain('CONVICTION_MATH');
    expect(prompt).toContain('do_nothing');
    expect(prompt).toContain('unrelated financial');
  });

  it('scoreOpenLoops resolves for an arbitrary user id (empty dataset) without throwing', async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return;
    }
    await expect(scorer.scoreOpenLoops(FAKE_USER_ID)).resolves.toBeDefined();
  }, 120_000);

  it('generateDirective maps scorer no_valid_action to a deterministic blocker (no failure sentinel)', async () => {
    const limitResult = async () => ({ data: [] as unknown[], error: null });
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              gte: () => ({
                order: () => ({
                  limit: limitResult,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const dbSpy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue(
      mockClient as ReturnType<typeof dbClient.createServerClient>,
    );
    const noValid: ScorerResult = {
      outcome: 'no_valid_action',
      winner: null,
      topCandidates: [],
      deprioritized: [],
      candidateDiscovery: {
        candidateCount: 0,
        suppressedCandidateCount: 0,
        selectionMargin: null,
        selectionReason: null,
        failureReason: 'Unit test pool exhausted',
        topCandidates: [],
      },
      antiPatterns: [],
      divergences: [],
      exact_blocker: {
        blocker_type: 'unit_test',
        blocker_reason: 'Test: no viable candidate.',
        top_blocked_candidate_title: null,
        top_blocked_candidate_type: null,
        top_blocked_candidate_action_type: null,
        suppression_goal_text: null,
        survivors_before_final_gate: 0,
        rejected_by_stage: {},
      },
    };
    const scoreSpy = vi.spyOn(scorer, 'scoreOpenLoops').mockResolvedValue(noValid);
    try {
      const d = await generateDirective(FAKE_USER_ID, { dryRun: true, skipSpendCap: true });
      expect(d.action_type).toBe('do_nothing');
      expect(d.directive).not.toBe('__GENERATION_FAILED__');
      expect(d.generationLog?.no_valid_action_blocker).toBe(true);
    } finally {
      dbSpy.mockRestore();
      scoreSpy.mockRestore();
    }
  }, 60_000);
});
