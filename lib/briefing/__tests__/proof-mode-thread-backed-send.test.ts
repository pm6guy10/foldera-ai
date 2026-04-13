import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateProofModeThreadBackedSendPreflight,
  isProofModeThreadBackedSendOnly,
  proofModeCanonicalCountsAsProofSuccess,
  proofModeThreadBackedSendEnforcementApplies,
} from '../generator';
import type { StructuredContext } from '../generator';
import type { ScoredLoop } from '../scorer';

const BASE_WINNER: ScoredLoop = {
  id: 'commitment-test-1',
  type: 'commitment',
  title: 'Follow up on Q2 deliverable',
  content: 'Thread shows open ask; peer owes a reply.',
  suggestedActionType: 'send_message',
  score: 4.2,
  breakdown: {
    stakes: 3,
    urgency: 0.7,
    tractability: 0.8,
    freshness: 0.85,
    actionTypeRate: 0.7,
    entityPenalty: 0,
  },
  relatedSignals: ['Signal one', 'Signal two'],
  sourceSignals: [
    { kind: 'signal', summary: 'Past thread', occurredAt: new Date().toISOString() },
  ],
  entityName: 'Jordan Lee',
  relationshipContext: 'Jordan Lee <jordan@client.example.com> | PM | last touch 3d ago',
};

function ctxWithFacts(
  overrides: Partial<StructuredContext> & {
    surgical_raw_facts?: string[];
    has_real_recipient?: boolean;
  },
): StructuredContext {
  return {
    selected_candidate: 'x',
    candidate_class: 'commitment',
    candidate_title: 't',
    candidate_reason: 'r',
    candidate_goal: null,
    matched_goal_category: null,
    candidate_score: 4,
    candidate_due_date: null,
    candidate_context_enrichment: null,
    supporting_signals: [],
    life_context_signals: [],
    surgical_raw_facts: ['recipient_email: jordan@client.example.com'],
    active_goals: [],
    locked_constraints: null,
    locked_contacts_prompt: null,
    recent_action_history_7d: [],
    has_real_target: true,
    has_real_recipient: true,
    has_recent_evidence: true,
    already_acted_recently: false,
    decision_already_made: false,
    can_execute_without_editing: true,
    has_due_date_or_time_anchor: true,
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
    required_causal_diagnosis: {
      why_exists_now: 'why',
      mechanism: 'mech',
    },
    trigger_context: null,
    recipient_brief: null,
    hunt_send_message_recipient_allowlist: [],
    discrepancy_class: null,
    ...overrides,
  } as StructuredContext;
}

describe('isProofModeThreadBackedSendOnly', () => {
  const prev = process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;

  afterEach(() => {
    if (prev === undefined) delete process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;
    else process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY = prev;
  });

  it('defaults off in Vitest (NODE_ENV=test) so integration tests stay unchanged', () => {
    delete process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;
    expect(process.env.NODE_ENV).toBe('test');
    expect(isProofModeThreadBackedSendOnly()).toBe(false);
  });

  it('forces on when FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY=true', () => {
    process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY = 'true';
    expect(isProofModeThreadBackedSendOnly()).toBe(true);
  });
});

describe('proofModeThreadBackedSendEnforcementApplies', () => {
  const prev = process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;

  afterEach(() => {
    if (prev === undefined) delete process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;
    else process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY = prev;
  });

  it('is false when global proof-mode send-only is off', () => {
    delete process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY;
    expect(
      proofModeThreadBackedSendEnforcementApplies(
        { type: 'commitment' },
        'send_message',
      ),
    ).toBe(false);
  });

  it('when proof-mode is on, still enforces thread-backed send for non-discrepancy write_document', () => {
    process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY = 'true';
    expect(
      proofModeThreadBackedSendEnforcementApplies(
        { type: 'commitment' },
        'write_document',
      ),
    ).toBe(true);
  });

  it('when proof-mode is on, exempts discrepancy winners whose canonical action is not send_message', () => {
    process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY = 'true';
    expect(
      proofModeThreadBackedSendEnforcementApplies(
        { type: 'discrepancy' },
        'write_document',
      ),
    ).toBe(false);
    expect(
      proofModeThreadBackedSendEnforcementApplies(
        { type: 'discrepancy' },
        'make_decision',
      ),
    ).toBe(false);
  });

  it('when proof-mode is on, discrepancy send_message winners still use full enforcement', () => {
    process.env.FOLDERA_PROOF_MODE_THREAD_BACKED_SEND_ONLY = 'true';
    expect(
      proofModeThreadBackedSendEnforcementApplies(
        { type: 'discrepancy' },
        'send_message',
      ),
    ).toBe(true);
  });
});

describe('evaluateProofModeThreadBackedSendPreflight', () => {
  const userEmails = new Set<string>(['owner@me.com']);

  it('does not gate when proofModeEnabled is false (non-proof behavior)', () => {
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: false,
      decisionRecommendedAction: 'write_document',
      ctx: ctxWithFacts({ has_real_recipient: false }),
      hydratedWinner: BASE_WINNER,
      userEmails,
    });
    expect(r).toEqual({ ok: true });
  });

  it('skips canonical write_document even if otherwise valid context', () => {
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: true,
      decisionRecommendedAction: 'write_document',
      ctx: ctxWithFacts({}),
      hydratedWinner: BASE_WINNER,
      userEmails,
    });
    expect(r).toMatchObject({
      ok: false,
      event: 'proof_mode_candidate_skipped_non_send',
      detail: 'write_document',
    });
  });

  it('skips send_message when there is no real external recipient', () => {
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: true,
      decisionRecommendedAction: 'send_message',
      ctx: ctxWithFacts({
        has_real_recipient: false,
        surgical_raw_facts: [],
      }),
      hydratedWinner: BASE_WINNER,
      userEmails,
    });
    expect(r).toMatchObject({
      ok: false,
      event: 'proof_mode_candidate_skipped_no_real_recipient',
    });
  });

  it('skips when facts have no eligible external recipient email', () => {
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: true,
      decisionRecommendedAction: 'send_message',
      ctx: ctxWithFacts({
        has_real_recipient: true,
        surgical_raw_facts: ['recipient_email: owner@me.com'],
      }),
      hydratedWinner: BASE_WINNER,
      userEmails,
    });
    expect(r).toMatchObject({
      ok: false,
      event: 'proof_mode_candidate_skipped_no_real_recipient',
      detail: 'no_eligible_external_recipient_in_facts',
    });
  });

  it('skips low-value hunt / promotional presentation', () => {
    const huntWinner: ScoredLoop = {
      ...BASE_WINNER,
      id: 'hunt-promo',
      type: 'hunt',
      title: 'Flash sale ends tonight — 50% off members exclusive',
      content: 'Subject: Flash sale ends tonight\nPreview: Shop now and save 60% off',
      sourceSignals: [{ kind: 'signal', summary: 'Flash sale ends tonight limited time offer' }],
    };
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: true,
      decisionRecommendedAction: 'send_message',
      ctx: ctxWithFacts({
        surgical_raw_facts: [
          'recipient_email: vendor@news.example.com',
          'hunt_grounded_peer_email: vendor@news.example.com',
        ],
      }),
      hydratedWinner: huntWinner,
      userEmails,
    });
    expect(r).toMatchObject({
      ok: false,
      event: 'proof_mode_candidate_skipped_low_value_promo',
    });
  });

  it('skips when winner is not thread-backed sendable (e.g. signal loop)', () => {
    const signalWinner: ScoredLoop = {
      ...BASE_WINNER,
      id: 'signal-1',
      type: 'signal',
    };
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: true,
      decisionRecommendedAction: 'send_message',
      ctx: ctxWithFacts({}),
      hydratedWinner: signalWinner,
      userEmails,
    });
    expect(r).toMatchObject({
      ok: false,
      event: 'proof_mode_candidate_skipped_not_thread_backed',
    });
  });

  it('accepts a thread-backed external send_message candidate', () => {
    const r = evaluateProofModeThreadBackedSendPreflight({
      proofModeEnabled: true,
      decisionRecommendedAction: 'send_message',
      ctx: ctxWithFacts({
        surgical_raw_facts: ['recipient_email: jordan@client.example.com'],
      }),
      hydratedWinner: BASE_WINNER,
      userEmails,
    });
    expect(r).toEqual({ ok: true });
  });
});

describe('proofModeCanonicalCountsAsProofSuccess', () => {
  it('treats wait_rationale as failure in proof mode', () => {
    expect(proofModeCanonicalCountsAsProofSuccess(true, 'wait_rationale')).toBe(false);
  });

  it('treats send_message as the only success in proof mode', () => {
    expect(proofModeCanonicalCountsAsProofSuccess(true, 'send_message')).toBe(true);
  });

  it('allows any canonical outcome when proof mode is off', () => {
    expect(proofModeCanonicalCountsAsProofSuccess(false, 'write_document')).toBe(true);
    expect(proofModeCanonicalCountsAsProofSuccess(false, 'schedule_block')).toBe(true);
    expect(proofModeCanonicalCountsAsProofSuccess(false, 'wait_rationale')).toBe(true);
  });
});
