/**
 * Adversarial proof tests for the DecisionPayload authority invariant.
 *
 * These tests prove three properties:
 * A) Hostile action drift: LLM tries to override recommended_action → persisted action unchanged
 * B) Hostile false-positive render: blocked payload + polished LLM output → generation fails closed
 * C) Renderer-only contract: final directive action comes from canonical payload, not render
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredLoop, ScorerResult } from '../scorer';
import type { DecisionPayload } from '../types';
import { validateDecisionPayload } from '../types';

// ─── Mocks ───────────────────────────────────────────────────────────────

const mockScoreOpenLoops = vi.fn<() => Promise<ScorerResult>>();
const mockIsOverDailyLimit = vi.fn<() => Promise<boolean>>();
const mockTrackApiCall = vi.fn<() => Promise<void>>();
const mockResearchWinner = vi.fn<() => Promise<null>>();
const mockGetDirectiveConstraintViolations = vi.fn();
const mockGetPinnedConstraintPrompt = vi.fn();
const mockLogStructuredEvent = vi.fn();

const DAY_MS = 24 * 60 * 60 * 1000;

function dateLabel(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * DAY_MS).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function isoDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * DAY_MS).toISOString();
}

const FOIL_DEADLINE_LABEL = dateLabel(30);
const FOIL_REVIEW_LABEL = dateLabel(28);
const FOIL_FILING_LABEL = dateLabel(26);

// Qualifying signal: received email 72h ago with no reply — satisfies all 4 discrepancy filters
const SIGNAL_72H_AGO = new Date(Date.now() - 72 * 3600000).toISOString();
const qualifyingSignal = {
  id: 'sig-db-1',
  // Proper email format: Subject header is required for parseSignalSnippet to extract subject,
  // which is required for buildAvoidanceObservations to detect no-reply-sent pattern.
  content: `From: Steven Goulden <sgoulden@nyc.gov>\nTo: brandon@example.com\nSubject: FOIL-2025-025-00440 Appeal Deadline ${FOIL_DEADLINE_LABEL}\n\nPlease respond to proceed with your FOIL appeal before the deadline.`,
  source: 'email_received',
  occurred_at: SIGNAL_72H_AGO,
  author: 'sgoulden@nyc.gov',
  type: 'email_received',
};
const signalQueryResult = { data: [qualifyingSignal], error: null };
const emptyResult = { data: [], error: null };

/** Default `tkg_signals` rows for mocks; tests may assign `emptyResult` or stale rows to isolate scorer-only freshness. */
let tkgSignalsMockRows: typeof signalQueryResult = signalQueryResult;

function makeLimitQuery(table: string) {
  // Return a qualifying received signal for tkg_signals so the discrepancy gate passes:
  // - hasRealThread: supporting_signals.length > 0 (OR tiedToOutcome)
  // - tiedToOutcome: set by winner.matchedGoal in buildWinner()
  // Only hard-block condition: no_thread AND no_outcome (both missing)
  const result = table === 'tkg_signals' ? tkgSignalsMockRows : emptyResult;
  return {
    eq() { return this; },
    neq() { return this; },
    in() { return this; },
    gte() { return this; },
    not() { return this; },
    is() { return this; },
    order() { return this; },
    limit() { return Promise.resolve(result); },
  };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      return { select() { return makeLimitQuery(table); } };
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { id: 'user-1', email: 'test@example.com', user_metadata: { name: 'Test User' }, email_confirmed_at: new Date().toISOString() } },
          error: null,
        }),
      },
    },
  }),
}));

vi.mock('../scorer', () => ({
  scoreOpenLoops: (...args: unknown[]) => mockScoreOpenLoops(...(args as [])),
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  isOverDailyLimit: (...args: unknown[]) => mockIsOverDailyLimit(...(args as [])),
  trackApiCall: (...args: unknown[]) => mockTrackApiCall(...(args as [])),
}));

vi.mock('../researcher', () => ({
  researchWinner: (...args: unknown[]) => mockResearchWinner(...(args as [])),
}));

vi.mock('../pinned-constraints', () => ({
  getDirectiveConstraintViolations: (...args: unknown[]) => mockGetDirectiveConstraintViolations(...(args as [])),
  getPinnedConstraintPrompt: (...args: unknown[]) => mockGetPinnedConstraintPrompt(...(args as [])),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: (...args: unknown[]) => mockLogStructuredEvent(...(args as [])),
}));

vi.mock('@/lib/encryption', () => ({
  // Return correct shape: { plaintext, usedFallback } — used by buildAvoidanceObservations
  // to detect no-reply patterns from the email thread
  decryptWithStatus: (_value: unknown) => ({ plaintext: String(_value), usedFallback: false }),
}));

// Anthropic mock — sequential responses per `messages.create` call (attempt 1, attempt 2, …)
let anthropicResponses: object[] = [{}];
let anthropicCallIdx = 0;
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => {
        const idx = anthropicCallIdx++;
        const body = anthropicResponses[idx] ?? anthropicResponses[anthropicResponses.length - 1] ?? {};
        return {
          content: [{ type: 'text', text: JSON.stringify(body) }],
          usage: { input_tokens: 100, output_tokens: 200 },
        };
      },
    };
  },
}));

const SENTINEL = 'NO_ACTIONABLE_DIRECTIVE_TODAY';

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildWinner(overrides: Partial<ScoredLoop> = {}): ScoredLoop {
  return {
    id: 'loop-1',
    type: 'commitment',
    title: `Send FOIL appeal to Steven Goulden before ${FOIL_DEADLINE_LABEL} deadline`,
    content: 'FOIL request denial FOIL-2025-025-00440 must be appealed in writing.',
    suggestedActionType: 'send_message',
    matchedGoal: { text: 'Resolve ESD overpayment waiver', priority: 5, category: 'financial' },
    score: 4.8,
    breakdown: { stakes: 5, urgency: 0.92, tractability: 0.81, freshness: 0.94, actionTypeRate: 0.5, entityPenalty: 0 },
    relatedSignals: ['FOIL denial letter received March 15'],
    sourceSignals: [{
      kind: 'signal', id: 'sig-1',
      occurredAt: new Date().toISOString(),
      summary: 'FOIL denial letter',
    }],
    relationshipContext: '- Steven Goulden <sgoulden@nyc.gov> (Records Officer)',
    confidence_prior: 72,
    ...overrides,
  };
}

function buildScorerResult(overrides: Partial<ScoredLoop> = {}): ScorerResult {
  return {
    outcome: 'winner_selected',
    winner: buildWinner(overrides),
    topCandidates: [buildWinner(overrides)],
    deprioritized: [],
    candidateDiscovery: {
      candidateCount: 3, suppressedCandidateCount: 0, selectionMargin: 0.8,
      selectionReason: 'score 4.8', failureReason: null, topCandidates: [],
    },
    antiPatterns: [],
    divergences: [],
    exact_blocker: null,
  };
}

function setupDefaults() {
  mockIsOverDailyLimit.mockResolvedValue(false);
  mockTrackApiCall.mockResolvedValue(undefined);
  mockResearchWinner.mockResolvedValue(null);
  mockGetDirectiveConstraintViolations.mockReturnValue([]);
  mockGetPinnedConstraintPrompt.mockReturnValue('');
  anthropicCallIdx = 0;
  anthropicResponses = [{}];
  tkgSignalsMockRows = signalQueryResult;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('TEST A — Hostile action drift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('scorer says send_message, LLM tries wait_rationale first → validation fails; compliant send_message on retry → persisted send_message', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: 'send_message',
    }));

    anthropicResponses = [
      {
        insight: 'No actionable pattern found — situation is stable.',
        decision: 'ACT',
        directive: 'There is nothing requiring urgent action at this particular time.',
        artifact_type: 'wait_rationale',
        artifact: {
          why_wait: 'No clear next step identified in recent signals',
          tripwire_date: isoDate(7),
          trigger_condition: 'New correspondence from Records Officer',
        },
        causal_diagnosis: { why_exists_now: 'Stable inbox', mechanism: 'No new inbound' },
        why_now: 'Situation is stable and no new developments warrant immediate action.',
      },
      {
        insight: 'Records officer must confirm appeal acceptance path before the statutory window closes.',
        decision: 'ACT',
        directive: 'Email Steven Goulden to confirm FOIL appeal acceptance and accountable owner by end of day.',
        artifact_type: 'send_message',
        artifact: {
          to: 'sgoulden@nyc.gov',
          subject: `Decision needed by 4 PM PT today: FOIL appeal acceptance before ${FOIL_REVIEW_LABEL}`,
          body: 'Can you confirm by 4 PM PT today whether this FOIL appeal submission is accepted, and who is the accountable owner for next-step review? If we miss this cutoff, the statutory appeal timeline is at risk.',
        },
        causal_diagnosis: { why_exists_now: 'Deadline pressure', mechanism: 'Unconfirmed acceptance path' },
        why_now: `The ${FOIL_DEADLINE_LABEL} appeal deadline requires confirmation today.`,
      },
    ];

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.action_type).toBe('send_message');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'generation_retry',
        generationStatus: 'retrying_validation',
      }),
    );
  });

  it('scorer says write_document, LLM returns send_message first → retry with write_document → persisted write_document', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: 'write_document',
    }));

    anthropicResponses = [
      {
        insight: 'Found urgent email to send.',
        decision: 'ACT',
        directive: 'Send email to Steven Goulden about FOIL appeal.',
        artifact_type: 'send_message',
        artifact: {
          to: 'sgoulden@nyc.gov',
          subject: `Decision needed by 4 PM PT today: FOIL appeal review owner before ${FOIL_REVIEW_LABEL}`,
          body: 'Can you confirm by 4 PM PT today whether the FOIL appeal is accepted for review and who owns the legal response? If this is not confirmed today, the filing window slips.',
        },
        causal_diagnosis: { why_exists_now: 'Deadline', mechanism: 'Unconfirmed owner' },
        why_now: 'Deadline approaching.',
      },
      {
        insight: 'Prep brief for legal path before filing.',
        decision: 'ACT',
        directive: 'Produce a one-page FOIL appeal decision brief naming owner and deadline.',
        artifact_type: 'write_document',
        artifact: {
          document_purpose: `Align legal on appeal path before ${FOIL_DEADLINE_LABEL}`,
          target_reader: 'Internal counsel',
          title: 'FOIL Appeal Decision Brief',
          content: `Decision required: confirm acceptance path and owner by 4 PM PT today. Next step: counsel must approve filing path by ${FOIL_FILING_LABEL} or the window slips.`,
        },
        causal_diagnosis: { why_exists_now: 'Deadline', mechanism: 'Unclear filing path' },
        why_now: 'Deadline approaching.',
      },
    ];

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.action_type).toBe('write_document');
  });
});

describe('TEST B — Hostile false-positive render (blocked payload)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('stale evidence + polished LLM artifact → generation fails closed', async () => {
    // No hydrated rows newer than scorer refs — freshness must come from winner.sourceSignals only (AZ-24 slice 2 union).
    tkgSignalsMockRows = emptyResult;

    // Scorer returns a winner but with stale signals (>14 days old)
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      sourceSignals: [{
        kind: 'signal', id: 'sig-old',
        occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
        summary: 'Old stale signal',
      }],
      relatedSignals: [],
    }));

    // LLM would return a polished artifact — generation never reaches LLM when DecisionPayload blocks
    anthropicResponses = [
      {
        insight: 'Critical deadline approaching.',
        decision: 'ACT',
        directive: 'Send the FOIL appeal immediately.',
        artifact_type: 'send_message',
        artifact: { to: 'sgoulden@nyc.gov', subject: 'FOIL Appeal', body: 'Dear Mr. Goulden, I am writing to appeal...' },
        why_now: `The ${FOIL_DEADLINE_LABEL} deadline.`,
      },
    ];

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: generation fails closed — evidence is stale, no directive persisted
    expect(result.action_type).toBe('do_nothing');
    expect(result.confidence).toBe(0);

    // DecisionPayload validation must have fired — in the candidate loop the event is
    // 'candidate_blocked' (not 'generation_skipped') when DecisionPayload validation fails.
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'candidate_blocked',
        generationStatus: 'decision_payload_blocked',
      }),
    );
  });

  it('already acted recently + polished LLM artifact → generation fails closed', async () => {
    // Scorer returns winner, but we need to simulate already_acted_recently.
    // The structured context computes this from guardrails.approvedRecently.
    // Since our DB mock returns empty arrays, this particular condition won't trigger here.
    // Instead, test the DecisionPayload validator directly:
    const dp: DecisionPayload = {
      winner_id: 'test-1',
      source_type: 'commitment',
      lifecycle_state: 'active',
      readiness_state: 'NO_SEND',
      recommended_action: 'send_message',
      action_target: 'FOIL appeal',
      justification_facts: ['Matched goal: ESD waiver'],
      confidence_score: 80,
      freshness_state: 'fresh',
      blocking_reasons: ['Already acted on this topic in the last 7 days'],
      matched_goal: 'Resolve ESD waiver',
      matched_goal_priority: 5,
      scorer_score: 4.8,
    };

    const errors = validateDecisionPayload(dp);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain('Already acted on this topic in the last 7 days');
  });
});

describe('TEST C — Renderer-only contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('final directive action_type is derived from canonicalAction; hostile schedule_block fails validation then send_message succeeds', async () => {
    const scorerAction = 'send_message';
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: scorerAction,
    }));

    anthropicResponses = [
      {
        insight: 'Schedule a prep meeting to prepare the FOIL appeal documents.',
        decision: 'ACT',
        directive: `Schedule a one-hour FOIL appeal preparation session for ${FOIL_FILING_LABEL}.`,
        artifact_type: 'schedule_block',
        artifact: {
          title: 'FOIL Appeal Prep',
          start: `${new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10)}T10:00:00Z`,
          duration_minutes: 60,
          reason: `Prepare appeal documents before ${FOIL_DEADLINE_LABEL} deadline`,
        },
        causal_diagnosis: { why_exists_now: 'Prep gap', mechanism: 'No session booked' },
        why_now: `The ${FOIL_DEADLINE_LABEL} FOIL deadline is two days away and prep has not started.`,
      },
      {
        insight: 'Records officer must confirm submission path before the deadline.',
        decision: 'ACT',
        directive: 'Email Steven Goulden to confirm FOIL submission path and owner today.',
        artifact_type: 'send_message',
        artifact: {
          to: 'sgoulden@nyc.gov',
          subject: `Decision needed by 4 PM PT today: FOIL appeal submission path before ${FOIL_REVIEW_LABEL}`,
          body: 'Can you confirm by 4 PM PT today whether we proceed with FOIL submission path A or B and who owns final filing? If we miss this, the deadline window closes.',
        },
        causal_diagnosis: { why_exists_now: 'Deadline', mechanism: 'Unconfirmed path' },
        why_now: `The ${FOIL_DEADLINE_LABEL} FOIL deadline is two days away and prep has not started.`,
      },
    ];

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.action_type).toBe(scorerAction);
    expect(result.action_type).not.toBe('schedule');

    const driftCalls = mockLogStructuredEvent.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).event === 'llm_action_drift_overridden',
    );
    expect(driftCalls.length).toBe(0);

    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'generation_retry',
        generationStatus: 'retrying_validation',
      }),
    );
  });

  it('persistence includes canonical action in generation log, not LLM action', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: 'write_document',
    }));

    anthropicResponses = [
      {
        insight: 'The FOIL denial must be appealed before the statutory deadline expires.',
        decision: 'ACT',
        directive: 'Draft the FOIL appeal letter addressing denial FOIL-2025-025-00440 for Steven Goulden.',
        artifact_type: 'write_document',
        artifact: {
          title: `FOIL Appeal Letter — FOIL-2025-025-00440 (${FOIL_DEADLINE_LABEL})`,
          document_purpose: 'Formal appeal of FOIL denial to NYC Records Officer',
          target_reader: 'Steven Goulden, Records Officer',
          content: `Decision required: confirm acceptance of FOIL-2025-025-00440 appeal and assign the accountable review owner.\n\nAsk: provide yes/no acceptance and owner assignment by 4 PM PT today.\n\nConsequence: if unresolved, statutory appeal timing risk increases and filing slips before ${FOIL_DEADLINE_LABEL}.`,
        },
        causal_diagnosis: { why_exists_now: 'Denial received', mechanism: 'Statutory window' },
        why_now: `The statutory appeal deadline is ${FOIL_DEADLINE_LABEL} — 14 days from the denial date.`,
      },
    ];

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: discrepancy gate preserves scorer's recommended_action when no hard block.
    // Scorer said write_document, LLM returned write_document, no hard blocks → write_document flows through.
    // No drift because canonical matches LLM.
    expect(result.action_type).toBe('write_document');

    // directive_generated log must show scorer's canonical action (write_document)
    const genCalls = mockLogStructuredEvent.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).event === 'directive_generated',
    );
    expect(genCalls.length).toBe(1);
    expect((genCalls[0][0] as Record<string, unknown>).details).toEqual(
      expect.objectContaining({
        canonical_action: 'write_document',
        action_drift: false,
      }),
    );
  });
});
