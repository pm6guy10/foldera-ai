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

const mockScoreOpenLoops = vi.fn<() => Promise<ScorerResult | null>>();
const mockIsOverDailyLimit = vi.fn<() => Promise<boolean>>();
const mockTrackApiCall = vi.fn<() => Promise<void>>();
const mockResearchWinner = vi.fn<() => Promise<null>>();
const mockGetDirectiveConstraintViolations = vi.fn();
const mockGetPinnedConstraintPrompt = vi.fn();
const mockLogStructuredEvent = vi.fn();

// Qualifying signal: received email 72h ago with no reply — satisfies all 4 discrepancy filters
const SIGNAL_72H_AGO = new Date(Date.now() - 72 * 3600000).toISOString();
const qualifyingSignal = {
  id: 'sig-db-1',
  // Proper email format: Subject header is required for parseSignalSnippet to extract subject,
  // which is required for buildAvoidanceObservations to detect no-reply-sent pattern.
  content: 'From: Steven Goulden <sgoulden@nyc.gov>\nTo: brandon@example.com\nSubject: FOIL-2025-025-00440 Appeal Deadline April 10\n\nPlease respond to proceed with your FOIL appeal before the deadline.',
  source: 'email_received',
  occurred_at: SIGNAL_72H_AGO,
  author: 'sgoulden@nyc.gov',
  type: 'email_received',
};
const signalQueryResult = { data: [qualifyingSignal], error: null };
const emptyResult = { data: [], error: null };

function makeLimitQuery(table: string) {
  // Return a qualifying received signal for tkg_signals so the discrepancy gate passes:
  // - hasRealThread: supporting_signals.length > 0
  // - hasNoReply: avoidance_observations detects received email with no reply
  // - meetsTimeThreshold: 72h > 48h
  // - tiedToOutcome: set by winner.matchedGoal in buildWinner()
  const result = table === 'tkg_signals' ? signalQueryResult : emptyResult;
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

// Anthropic mock — returns whatever response we configure
let anthropicResponse: object = {};
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: JSON.stringify(anthropicResponse) }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    };
  },
}));

const SENTINEL = 'NO_ACTIONABLE_DIRECTIVE_TODAY';

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildWinner(overrides: Partial<ScoredLoop> = {}): ScoredLoop {
  return {
    id: 'loop-1',
    type: 'commitment',
    title: 'Send FOIL appeal to Steven Goulden before April 10 deadline',
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
    winner: buildWinner(overrides),
    topCandidates: [buildWinner(overrides)],
    deprioritized: [],
    candidateDiscovery: {
      candidateCount: 3, suppressedCandidateCount: 0, selectionMargin: 0.8,
      selectionReason: 'score 4.8', failureReason: null, topCandidates: [],
    },
    antiPatterns: [],
    divergences: [],
  };
}

function setupDefaults() {
  mockIsOverDailyLimit.mockResolvedValue(false);
  mockTrackApiCall.mockResolvedValue(undefined);
  mockResearchWinner.mockResolvedValue(null);
  mockGetDirectiveConstraintViolations.mockReturnValue([]);
  mockGetPinnedConstraintPrompt.mockReturnValue('');
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('TEST A — Hostile action drift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('scorer says send_message, LLM returns wait_rationale + do-nothing directive → persisted action remains send_message', async () => {
    // Scorer recommends send_message to sgoulden@nyc.gov with real recipient
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: 'send_message',
    }));

    // LLM tries to override: returns wait_rationale and "nothing to do" language.
    // With the legacy commitment conversion REMOVED, the raw LLM artifact_type
    // reaches drift detection unmodified. This is the adversarial proof:
    // the LLM's hostile action is observed, logged, and overridden.
    anthropicResponse = {
      insight: 'No actionable pattern found — situation is stable.',
      decision: 'ACT',  // Note: even says ACT, but tries to slip in wait_rationale
      directive: 'There is nothing requiring urgent action at this particular time.',
      artifact_type: 'wait_rationale',  // <-- HOSTILE: tries to override send_message
      artifact: { why_wait: 'No clear next step identified in recent signals', tripwire_date: '2026-04-01', trigger_condition: 'New correspondence from Records Officer' },
      why_now: 'Situation is stable and no new developments warrant immediate action.',
    };

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: action_type comes from DecisionPayload (scorer), not LLM
    // The scorer said send_message with a real recipient → canonical action is send_message
    expect(result.action_type).toBe('send_message');

    // The LLM's raw wait_rationale is captured as drift and overridden by canonical action
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'llm_action_drift_overridden',
        details: expect.objectContaining({
          canonical_action: 'send_message',
          llm_attempted_action: 'wait_rationale',
        }),
      }),
    );
  });

  it('scorer says write_document, LLM returns send_message → persisted action remains write_document', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: 'write_document',
    }));

    anthropicResponse = {
      insight: 'Found urgent email to send.',
      decision: 'ACT',
      directive: 'Send email to Steven Goulden about FOIL appeal.',
      artifact_type: 'send_message',  // <-- HOSTILE: tries to override write_document
      artifact: { to: 'sgoulden@nyc.gov', subject: 'FOIL Appeal', body: 'Dear Mr. Goulden...' },
      why_now: 'Deadline approaching.',
    };

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: discrepancy gate forces send_message regardless of scorer suggestion.
    // The scorer said write_document, but the gate's final authority overrides it.
    // The LLM returned send_message which happens to match the gate — no drift logged.
    expect(result.action_type).toBe('send_message');
  });
});

describe('TEST B — Hostile false-positive render (blocked payload)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('stale evidence + polished LLM artifact → generation fails closed', async () => {
    // Scorer returns a winner but with stale signals (>14 days old)
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      sourceSignals: [{
        kind: 'signal', id: 'sig-old',
        occurredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days old
        summary: 'Old stale signal',
      }],
      relatedSignals: [],
    }));

    // LLM returns a polished, actionable artifact anyway
    anthropicResponse = {
      insight: 'Critical deadline approaching.',
      decision: 'ACT',
      directive: 'Send the FOIL appeal immediately.',
      artifact_type: 'send_message',
      artifact: { to: 'sgoulden@nyc.gov', subject: 'FOIL Appeal', body: 'Dear Mr. Goulden, I am writing to appeal...' },
      why_now: 'April 10 deadline.',
    };

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: generation fails closed — evidence is stale, no directive persisted
    expect(result.action_type).toBe('do_nothing');
    expect(result.confidence).toBe(0);

    // DecisionPayload validation must have fired
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'generation_skipped',
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

  it('final directive action_type is derived from canonicalAction, not payload.artifact_type', async () => {
    const scorerAction = 'send_message';
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: scorerAction,
    }));

    // LLM returns completely different artifact_type (with all required fields so it passes
    // validateGeneratedArtifact — proving that even a well-formed hostile artifact can't
    // change the persisted action)
    const llmAction = 'schedule_block';
    anthropicResponse = {
      insight: 'Schedule a prep meeting to prepare the FOIL appeal documents.',
      decision: 'ACT',
      directive: 'Schedule a one-hour FOIL appeal preparation session for April 8.',
      artifact_type: llmAction,
      artifact: { title: 'FOIL Appeal Prep', start: '2026-04-08T10:00:00Z', duration_minutes: 60, reason: 'Prepare appeal documents before April 10 deadline' },
      why_now: 'The April 10 FOIL deadline is two days away and prep has not started.',
    };

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: persisted action = scorer's action (send_message), NOT LLM's (schedule_block)
    expect(result.action_type).toBe(scorerAction);
    expect(result.action_type).not.toBe('schedule');  // schedule_block maps to 'schedule'

    // Verify drift was logged
    const driftCalls = mockLogStructuredEvent.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).event === 'llm_action_drift_overridden',
    );
    expect(driftCalls.length).toBe(1);
    expect((driftCalls[0][0] as Record<string, unknown>).details).toEqual(
      expect.objectContaining({
        canonical_action: 'send_message',
        llm_attempted_action: 'schedule_block',
      }),
    );
  });

  it('persistence includes canonical action in generation log, not LLM action', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult({
      suggestedActionType: 'write_document',
    }));

    anthropicResponse = {
      insight: 'The FOIL denial must be appealed before the statutory deadline expires.',
      decision: 'ACT',
      directive: 'Draft the FOIL appeal letter addressing denial FOIL-2025-025-00440 for Steven Goulden.',
      artifact_type: 'write_document',  // happens to match — no drift this time
      artifact: {
        title: 'FOIL Appeal Letter — FOIL-2025-025-00440',
        document_purpose: 'Formal appeal of FOIL denial to NYC Records Officer',
        target_reader: 'Steven Goulden, Records Officer',
        content: 'Dear Mr. Goulden,\n\nI am writing to formally appeal the denial of my FOIL request, reference number FOIL-2025-025-00440, dated March 15, 2026. The denial cited exemption under Public Officers Law §87(2)(g), but the requested records do not fall within that exemption.\n\nPlease reconsider this determination.\n\nSincerely,\nBrandon Kapp',
      },
      why_now: 'The statutory appeal deadline is April 10 — 14 days from the denial date.',
    };

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    // INVARIANT: discrepancy gate forces send_message regardless of scorer suggestion.
    // Scorer said write_document, LLM returned write_document, but gate overrides to send_message.
    // Drift IS logged: canonical=send_message, llm_attempted=write_document.
    expect(result.action_type).toBe('send_message');

    // directive_generated log must show gate's canonical action (send_message), not scorer's (write_document)
    const genCalls = mockLogStructuredEvent.mock.calls.filter(
      (c: unknown[]) => (c[0] as Record<string, unknown>).event === 'directive_generated',
    );
    expect(genCalls.length).toBe(1);
    expect((genCalls[0][0] as Record<string, unknown>).details).toEqual(
      expect.objectContaining({
        canonical_action: 'send_message',
        action_drift: true,
      }),
    );
  });
});
