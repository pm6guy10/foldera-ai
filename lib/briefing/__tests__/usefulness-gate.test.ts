/**
 * Execution-backed proof of the usefulness gate.
 *
 * Each case feeds a specific payload through the real generateDirective() call path.
 * We check the actual returned object and which logStructuredEvent was fired.
 *
 * Key facts established by reading the source before writing this test:
 *  - validateGeneratedArtifact fires BEFORE isUseful (inside generatePayload)
 *  - BANNED_LANGUAGE_PATTERNS does NOT include "just checking in" / "touching base" etc.
 *    so generic-language artifacts pass structural validation and only isUseful catches them.
 *  - evidence:"" and directive:<12chars are caught by validateGeneratedArtifact first.
 *  - generateDirective() never inserts into tkg_actions — callers do. If it returns
 *    GENERATION_FAILED_SENTINEL the caller skips persistence and send.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredLoop, ScorerResult } from '../scorer';

// ─── Mocks (identical pattern to generator-runtime.test.ts) ───────────────

const mockScoreOpenLoops = vi.fn<() => Promise<ScorerResult | null>>();
const mockIsOverDailyLimit = vi.fn<() => Promise<boolean>>();
const mockTrackApiCall = vi.fn<() => Promise<void>>();
const mockResearchWinner = vi.fn<() => Promise<null>>();
const mockGetDirectiveConstraintViolations = vi.fn();
const mockGetPinnedConstraintPrompt = vi.fn();
const mockLogStructuredEvent = vi.fn();

const queryResult = { data: [], error: null };
const tkgActionsResultsQueue: Array<{ data: unknown[]; error: null }> = [];

// Qualifying signal: received email 72h ago — satisfies all 4 discrepancy gate filters.
// Subject header required for parseSignalSnippet + buildAvoidanceObservations no-reply detection.
const SIGNAL_72H_AGO = new Date(Date.now() - 72 * 3600000).toISOString();
const qualifyingSignal = {
  id: 'sig-db-1',
  content: 'From: Steven Goulden <sgoulden@nyc.gov>\nTo: brandon@example.com\nSubject: FOIL-2025-025-00440 Appeal Deadline April 10\n\nPlease respond to proceed with your FOIL appeal before the deadline.',
  source: 'email_received',
  occurred_at: SIGNAL_72H_AGO,
  author: 'sgoulden@nyc.gov',
  type: 'email_received',
};
const signalQueryResult = { data: [qualifyingSignal], error: null };

function makeLimitQuery(table: string, result = queryResult) {
  return {
    eq() { return this; },
    neq() { return this; },
    in() { return this; },
    gte() { return this; },
    not() { return this; },
    is() { return this; },
    order() { return this; },
    limit() {
      if (table === 'tkg_actions' && tkgActionsResultsQueue.length > 0) {
        return Promise.resolve(tkgActionsResultsQueue.shift());
      }
      return Promise.resolve(result);
    },
  };
}

function makeSignalsQuery() {
  return {
    select() {
      return {
        in() { return Promise.resolve(signalQueryResult); },
        eq() { return this; },
        neq() { return this; },
        gte() { return this; },
        not() { return this; },
        is() { return this; },
        order() { return this; },
        limit() { return Promise.resolve(signalQueryResult); },
      };
    },
  };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'tkg_actions' || table === 'tkg_goals') {
        return { select() { return makeLimitQuery(table); } };
      }
      if (table === 'tkg_signals') { return makeSignalsQuery(); }
      throw new Error(`Unexpected table: ${table}`);
    },
    auth: {
      admin: {
        getUserById: async (_userId: string) => ({
          data: {
            user: {
              id: _userId,
              email: 'b.kapp1010@gmail.com',
              user_metadata: { name: 'Brandon Kapp', given_name: 'Brandon', family_name: 'Kapp' },
              email_confirmed_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      },
    },
  }),
}));

vi.mock('@/lib/briefing/scorer', () => ({ scoreOpenLoops: mockScoreOpenLoops }));
vi.mock('@/lib/utils/api-tracker', () => ({ isOverDailyLimit: mockIsOverDailyLimit, trackApiCall: mockTrackApiCall }));
vi.mock('@/lib/briefing/researcher', () => ({ researchWinner: mockResearchWinner }));
vi.mock('@/lib/briefing/pinned-constraints', () => ({
  getDirectiveConstraintViolations: mockGetDirectiveConstraintViolations,
  getPinnedConstraintPrompt: mockGetPinnedConstraintPrompt,
}));
vi.mock('@/lib/utils/structured-logger', () => ({ logStructuredEvent: mockLogStructuredEvent }));

// Encryption mock — buildAvoidanceObservations calls decryptWithStatus on signal content.
// Return correct shape { plaintext, usedFallback } so the no-reply observer works.
vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: (_value: unknown) => ({ plaintext: String(_value), usedFallback: false }),
}));

const anthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreate };
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildWinner(): ScoredLoop {
  return {
    id: 'loop-1',
    type: 'signal',
    title: 'Follow up with the MAS3 hiring manager before the interview window closes',
    content: 'The MAS3 hiring manager still has not replied, and the interview window closes this week.',
    suggestedActionType: 'send_message',
    matchedGoal: { text: 'Land the MAS3 role', priority: 5, category: 'career' },
    score: 4.8,
    breakdown: { stakes: 5, urgency: 0.92, tractability: 0.81, freshness: 0.94, actionTypeRate: 0.5, entityPenalty: 0 },
    relatedSignals: ['Hiring manager has not responded to the last thread.'],
    sourceSignals: [{
      kind: 'signal', id: 'sig-1',
      occurredAt: new Date().toISOString(),
      summary: 'MAS3 hiring manager thread',
    }],
    relationshipContext: '- MAS3 Hiring Manager <manager@mas3corp.com> (Hiring)',
  };
}

function buildScorerResult(): ScorerResult {
  return {
    winner: buildWinner(),
    deprioritized: [],
    candidateDiscovery: {
      candidateCount: 3, suppressedCandidateCount: 0, selectionMargin: 0.8,
      selectionReason: 'score 4.8 beat next-best', failureReason: null, topCandidates: [],
    },
  };
}

function anthropicResponse(payload: object) {
  return {
    usage: { input_tokens: 100, output_tokens: 80 },
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

const SENTINEL = '__GENERATION_FAILED__';

// ─── Tests ────────────────────────────────────────────────────────────────

describe('usefulness gate — execution proof', () => {
  beforeEach(() => {
    vi.resetModules();
    mockScoreOpenLoops.mockReset();
    mockIsOverDailyLimit.mockReset();
    mockTrackApiCall.mockReset();
    mockResearchWinner.mockReset();
    mockGetDirectiveConstraintViolations.mockReset();
    mockGetPinnedConstraintPrompt.mockReset();
    mockLogStructuredEvent.mockReset();
    anthropicCreate.mockReset();
    tkgActionsResultsQueue.length = 0;

    mockIsOverDailyLimit.mockResolvedValue(false);
    mockResearchWinner.mockResolvedValue(null);
    mockGetDirectiveConstraintViolations.mockReturnValue([]);
    mockGetPinnedConstraintPrompt.mockReturnValue(null);
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult());
  });

  // ── BAD CASE 1: no_output (artifact is null in JSON) ──────────────────
  it('BAD1 — no_output: null artifact → GENERATION_FAILED_SENTINEL (caught before isUseful by validateGeneratedArtifact)', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the follow-up email to the MAS3 hiring manager before the window closes.',
      artifact_type: 'send_message',
      artifact: null,
      evidence: 'The interview window closes this week and manager has not replied.',
      why_now: 'Timing window closes this week.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('BAD1 result.directive:', result.directive);
    console.log('BAD1 result.action_type:', result.action_type);
    console.log('BAD1 generationLog.stage:', result.generationLog?.stage);

    expect(result.directive).toBe(SENTINEL);
    // Caught by validateGeneratedArtifact (null artifact), NOT by usefulness gate
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });

  // ── BAD CASE 2: empty_artifact (artifact JSON < 50 chars) ─────────────
  it('BAD2 — empty_artifact: artifact JSON under 50 chars → GENERATION_FAILED_SENTINEL (caught by validateGeneratedArtifact missing required fields)', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the follow-up email to the MAS3 hiring manager before the window closes.',
      artifact_type: 'send_message',
      artifact: { to: 'a@b.com' }, // missing subject and body → fails validateGeneratedArtifact
      evidence: 'The interview window closes this week and manager has not replied.',
      why_now: 'Timing window closes this week.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('BAD2 result.directive:', result.directive);
    console.log('BAD2 result.action_type:', result.action_type);
    console.log('BAD2 generationLog.stage:', result.generationLog?.stage);

    expect(result.directive).toBe(SENTINEL);
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });

  // ── BAD CASE 3: no_evidence ────────────────────────────────────────────
  it('BAD3 — no_evidence: evidence:"" → GENERATION_FAILED_SENTINEL (caught by validateGeneratedArtifact, evidence field required ≥12 chars)', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the follow-up email to the MAS3 hiring manager before the window closes.',
      artifact_type: 'send_message',
      artifact: {
        to: 'manager@mas3corp.com',
        subject: 'MAS3 interview timeline',
        body: 'Hi,\n\nI wanted to follow up on the MAS3 interview process. Looking forward to hearing back.\n\nBest,\nBrandon',
      },
      evidence: '',
      why_now: 'Timing window closes this week.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('BAD3 result.directive:', result.directive);
    console.log('BAD3 result.action_type:', result.action_type);
    console.log('BAD3 generationLog.stage:', result.generationLog?.stage);

    expect(result.directive).toBe(SENTINEL);
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });

  // ── BAD CASE 4: generic_language ──────────────────────────────────────
  // "just checking in" is NOT in BANNED_LANGUAGE_PATTERNS → passes validateGeneratedArtifact
  // → isUseful is the only gate that catches this
  it('BAD4 — generic_language: "just checking in" in artifact body → GENERATION_FAILED_SENTINEL WITH usefulness_rejected event', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the follow-up email to the MAS3 hiring manager before the window closes.',
      artifact_type: 'send_message',
      artifact: {
        to: 'manager@mas3corp.com',
        subject: 'MAS3 interview timeline follow-up',
        body: 'Hi,\n\njust checking in to see if you had a chance to review my application for the MAS3 role. The window closes this week.\n\nBest,\nBrandon',
      },
      evidence: 'The interview window closes this week and the manager has not replied.',
      why_now: 'The interview window closes this week.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('BAD4 result.directive:', result.directive);
    console.log('BAD4 result.action_type:', result.action_type);
    console.log('BAD4 generationLog.stage:', result.generationLog?.stage);
    console.log('BAD4 usefulness_rejected logged:', mockLogStructuredEvent.mock.calls.some(
      c => c[0]?.event === 'usefulness_rejected'
    ));

    expect(result.directive).toBe(SENTINEL);
    // THIS is the case that isUseful uniquely catches
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'candidate_blocked',
        details: expect.objectContaining({ reason: 'generic_language' }),
      })
    );
  });

  // ── BAD CASE 5: no_action ─────────────────────────────────────────────
  it('BAD5 — no_action: directive too short → GENERATION_FAILED_SENTINEL (caught by validateGeneratedArtifact, directive required ≥12 chars)', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Do', // 2 chars — fails validateStringField (< 12 chars)
      artifact_type: 'send_message',
      artifact: {
        to: 'manager@mas3corp.com',
        subject: 'MAS3 interview timeline follow-up',
        body: 'Hi,\n\nI wanted to follow up on the MAS3 interview process. Looking forward to hearing back.\n\nBest,\nBrandon',
      },
      evidence: 'The interview window closes this week and the manager has not replied.',
      why_now: 'Timing window closes this week.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('BAD5 result.directive:', result.directive);
    console.log('BAD5 result.action_type:', result.action_type);
    console.log('BAD5 generationLog.stage:', result.generationLog?.stage);

    expect(result.directive).toBe(SENTINEL);
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });

  // ── VALID CASE 1: send_message ─────────────────────────────────────────
  it('VALID1 — send_message: well-formed payload → NOT GENERATION_FAILED_SENTINEL (passes all gates)', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the budget confirmation email to Marcus before the April board meeting.',
      artifact_type: 'send_message',
      artifact: {
        to: 'marcus@company.com',
        subject: 'Q1 infrastructure budget — confirmation before April 3 board meeting',
        body: 'Hi Marcus,\n\nFollowing your Q1 update, I want to confirm the infrastructure budget allocation before the April 3 board meeting. Can you confirm the $240k figure is finalized?\n\nThanks,\nBrandon',
      },
      evidence: 'Marcus sent Q1 budget update on March 20; April 3 board meeting has no confirmed budget line.',
      why_now: 'The board meeting is 7 days away and the budget line is unconfirmed.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('VALID1 result.directive:', result.directive);
    console.log('VALID1 result.action_type:', result.action_type);
    console.log('VALID1 result.confidence:', result.confidence);

    expect(result.directive).not.toBe(SENTINEL);
    expect(result.action_type).toBe('send_message');
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });

  // ── VALID CASE 2: write_document ──────────────────────────────────────
  it('VALID2 — write_document: well-formed payload → NOT GENERATION_FAILED_SENTINEL (passes all gates)', async () => {
    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the Acme integration status report to their stakeholders before Thursday.',
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'Update Acme stakeholders on integration scope, timeline, and open blockers',
        target_reader: 'Acme stakeholders',
        title: 'Acme Integration — Status Report March 27',
        content: 'Project status as of March 27, 2026:\n\nScope: API integration covering order sync and inventory feed.\nTimeline: Go-live April 10.\nOpen blockers: Auth token rotation needs sign-off from Acme security team by March 29.\n\nNext step: Brandon to follow up with Acme security on March 28.',
      },
      evidence: 'Slack thread from March 24 shows blocker unresolved; deadline is April 10.',
      why_now: 'Acme security sign-off deadline is March 29 — two days away.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('VALID2 result.directive:', result.directive);
    console.log('VALID2 result.action_type:', result.action_type);
    console.log('VALID2 result.confidence:', result.confidence);

    expect(result.directive).not.toBe(SENTINEL);
    // After DecisionPayload enforcement: action_type comes from scorer's suggestedActionType
    // (send_message), not from LLM's artifact_type (write_document). The scorer is authoritative.
    expect(result.action_type).toBe('send_message');
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });
});
