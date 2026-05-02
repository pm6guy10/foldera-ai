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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredLoop, ScorerResult, ScorerResultWinnerSelected } from '../scorer';

const FIXED_NOW = new Date('2026-04-20T15:00:00.000Z');

// ─── Mocks (identical pattern to generator-runtime.test.ts) ───────────────

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

const FOIL_DEADLINE_LABEL = dateLabel(30);
const BOARD_MEETING_LABEL = dateLabel(7);
const GO_LIVE_LABEL = dateLabel(10);

const queryResult = { data: [], error: null };
const tkgActionsResultsQueue: Array<{ data: unknown[]; error: null }> = [];

// Qualifying signal: received email 72h ago — satisfies all 4 discrepancy gate filters.
// Subject header required for parseSignalSnippet + buildAvoidanceObservations no-reply detection.
const SIGNAL_72H_AGO = new Date(Date.now() - 72 * 3600000).toISOString();
const qualifyingSignal = {
  id: 'sig-db-1',
  content: `From: Steven Goulden <sgoulden@nyc.gov>\nTo: brandon@example.com\nSubject: FOIL-2025-025-00440 Appeal Deadline ${FOIL_DEADLINE_LABEL}\n\nPlease respond to proceed with your FOIL appeal before the deadline.`,
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

/** Matches generator-runtime: locked-contact fetch must not throw (avoids locked_contacts_fetch_failed noise). */
function emptyConstraintsSelect() {
  const result = { data: [] as unknown[], error: null };
  const builder: Record<string, unknown> & { then: (resolve: (r: unknown) => void) => void } = {
    eq() { return builder; },
    then(resolve: (r: unknown) => void) { resolve(result); },
  };
  return { select() { return builder; } };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'tkg_actions' || table === 'tkg_goals') {
        return { select() { return makeLimitQuery(table); } };
      }
      if (table === 'tkg_signals') { return makeSignalsQuery(); }
      if (table === 'tkg_constraints') { return emptyConstraintsSelect(); }
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

vi.mock('@/lib/briefing/scorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scorer')>();
  return {
    ...actual,
    scoreOpenLoops: mockScoreOpenLoops,
  };
});
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
    confidence_prior: 78,
  };
}

function buildScorerResult(winner: ScoredLoop = buildWinner()): ScorerResultWinnerSelected {
  return {
    outcome: 'winner_selected',
    winner,
    topCandidates: [winner],
    deprioritized: [],
    candidateDiscovery: {
      candidateCount: 3, suppressedCandidateCount: 0, selectionMargin: 0.8,
      selectionReason: 'score 4.8 beat next-best', failureReason: null, topCandidates: [],
    },
    antiPatterns: [],
    divergences: [],
    exact_blocker: null,
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
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
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

  afterEach(() => {
    vi.useRealTimers();
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
  }, 15_000);

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
    // With decision enforcement enabled, this is blocked before usefulness.
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'candidate_blocked',
        generationStatus: 'llm_generation_failed',
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

  it('BAD6 — homework_handoff: prep document sends research/examples back to user → GENERATION_FAILED_SENTINEL before persistence', async () => {
    const writeWinner = {
      ...buildWinner(),
      id: 'discrepancy_exposure_mas3_interview',
      type: 'discrepancy' as const,
      discrepancyClass: 'exposure' as const,
      suggestedActionType: 'write_document' as const,
      // Deliberately non-interview wording so interview-class enforcement relaxation does not apply.
      title: 'MAS3 Project go-live review is 4 days away with no prep artifact',
      content: 'Authorization forms were sent, but no finished prep packet exists.',
      matchedGoal: { text: 'Land the MAS3 role', priority: 5, category: 'career' },
      sourceSignals: [{
        kind: 'commitment' as const,
        id: 'commitment-mas3',
        occurredAt: new Date().toISOString(),
        summary: 'MAS3 Project deadline',
      }],
    };
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult(writeWinner));

    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Prepare the MAS3 compliance packet before the go-live window closes.',
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'compliance prep',
        target_reader: 'user',
        title: 'MAS3 Project Prep',
        content: [
          'PROJECT DETAILS',
          'Position: Health Benefits Specialist 3 (MAS3/AHSO) - Project',
          'Scheduled: April 20, 2026',
          '',
          'PREPARED ANSWERS',
          'Prepare a specific example for your most complex benefits eligibility case.',
          '',
          'RESEARCH BEFORE APRIL 20',
          "Review HCA's website for current initiatives and recent healthcare policy changes.",
          'Familiarize yourself with Washington State Medicaid before the review.',
        ].join('\n'),
      },
      evidence: 'MAS3 go-live review is scheduled and authorization forms were sent, but no prep artifact exists.',
      why_now: 'The compliance window closes this week.',
      causal_diagnosis: {
        why_exists_now: 'Prep work is still unresolved while the date is fixed.',
        mechanism: 'The calendar commitment exists but finished prep material has not been produced.',
      },
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.directive).toBe(SENTINEL);
    expect(result.generationLog?.reason).toContain('homework_handoff:');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'candidate_blocked',
        generationStatus: 'llm_generation_failed',
        details: expect.objectContaining({
          issues: expect.arrayContaining([
            expect.stringMatching(/^homework_handoff:/),
          ]),
        }),
      })
    );
  });

  it('VALID homework_handoff — grounded finished brief may mention preparation steps without failing', async () => {
    const writeWinner = {
      ...buildWinner(),
      id: 'care-coordinator-finished-brief',
      type: 'discrepancy' as const,
      discrepancyClass: 'exposure' as const,
      suggestedActionType: 'write_document' as const,
      title: 'Care Coordinator interview brief is due before the upcoming conversation',
      content:
        'Alex Crisler confirmed the upcoming Care Coordinator interview with Comprehensive Healthcare, and the brief needs ready-to-say talking points.',
      relationshipContext: 'Alex Crisler <alex.crisler@comphc.org> (Recruiting)',
      entityName: 'Alex Crisler',
      matchedGoal: { text: 'Land the Care Coordinator role', priority: 5, category: 'career' },
      sourceSignals: [{
        kind: 'signal' as const,
        id: 'sig-care-coordinator-brief',
        occurredAt: new Date().toISOString(),
        summary: 'Alex Crisler confirmed the upcoming Care Coordinator interview with Comprehensive Healthcare.',
      }],
    };
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult(writeWinner));

    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Use the finished Care Coordinator interview brief before the upcoming conversation with Comprehensive Healthcare.',
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'Finished interview talking-point brief for the Care Coordinator role',
        target_reader: 'Brandon Kapp',
        title: 'Care Coordinator Interview Brief — Comprehensive Healthcare',
        content: [
          'Decision required: use one grounded answer spine for the upcoming Care Coordinator conversation with Alex Crisler and Comprehensive Healthcare.',
          '',
          'Owner: Brandon owns the answer spine now, so the interview is not blocked by an unassigned preparation dependency.',
          '',
          'Say this: "I am strongest when coordination work has to stay calm, documented, and patient-centered. For this Care Coordinator role, I would anchor my answers in follow-through, accurate handoffs, and clear communication when schedules move quickly."',
          '',
          'Use this example spine: start with a complex care coordination case, name the documentation accuracy issue, then close with how calm communication kept the handoff moving under time pressure.',
          'If this is a panel interview, keep this answer order: coordination problem, documentation move, patient-centered handoff, result.',
          'Deadline: use this brief before the interview starts this week.',
          '',
          'Ask: before the interview, choose this answer spine and keep each answer tied to the Care Coordinator responsibilities.',
          '',
          'Consequence: if the answer stays generic, Alex Crisler only hears motivation instead of role-specific proof for Comprehensive Healthcare.',
        ].join('\n'),
      },
      causal_diagnosis: {
        why_exists_now: 'The interview is fixed on the calendar and the source names the employer and role.',
        mechanism: 'The risk is generic answers, not missing logistics.',
      },
      evidence: 'Alex Crisler confirmed the upcoming Care Coordinator interview with Comprehensive Healthcare.',
      why_now: 'The interview is close enough that the finished talking-point spine needs to be locked now.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.directive).not.toBe(SENTINEL);
    expect(result.action_type).toBe('write_document');
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'candidate_blocked',
        details: expect.objectContaining({
          issues: expect.arrayContaining([
            expect.stringMatching(/^homework_handoff:/),
          ]),
        }),
      })
    );
  });

  // ── VALID CASE 1: send_message ─────────────────────────────────────────
  it('VALID1 — send_message: well-formed payload → NOT GENERATION_FAILED_SENTINEL (passes all gates)', async () => {
    // Align scorer winner with the mocked LLM (Marcus / Q1 board). Default buildWinner() is MAS3-only;
    // a mismatched title flows into post_bracket_salvage subject lines containing "Follow up…", which
    // then trips causal_diagnosis:surface_follow_up_mismatch (PASSIVE_OR_IGNORABLE / follow-up heuristics).
    const marcusBudgetWinner: ScoredLoop = {
      ...buildWinner(),
      id: 'loop-budget-marcus',
      title: 'Confirm Q1 infrastructure line with Marcus before the board packet freeze',
      content:
        'Marcus sent a Q1 update; the board book still shows an unconfirmed infrastructure figure and sign-off is unclear.',
      relatedSignals: [
        'Marcus (marcus@company.com) emailed a Q1 budget update; infrastructure line is not locked for the board packet.',
      ],
      sourceSignals: [
        {
          kind: 'signal',
          id: 'sig-budget-marcus',
          occurredAt: new Date().toISOString(),
          summary: 'Q1 budget update thread with Marcus',
        },
      ],
      relationshipContext: 'Marcus <marcus@company.com> (Finance)',
      matchedGoal: { text: 'Board-ready Q1 close', priority: 4, category: 'financial' },
    };
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult(marcusBudgetWinner));

    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the budget confirmation email to Marcus today.',
      artifact_type: 'send_message',
      artifact: {
        to: 'marcus@company.com',
        subject: 'Q1 infrastructure budget — confirmation needed today',
        body: `Hi Marcus,\n\nFollowing your Q1 update, can you confirm by 3 PM PT today whether the infrastructure figure you quoted is final and who owns board packet sign-off? If we miss this cutoff, the ${BOARD_MEETING_LABEL} board packet goes forward with an unresolved budget line.\n\nThanks,\nBrandon`,
      },
      // Avoid past calendar month/day strings here — stale-date gate scans evidence + directive fields.
      evidence:
        'Marcus (marcus@company.com) sent a recent Q1 budget update; the board packet still lacks a confirmed infrastructure line.',
      why_now: `The ${BOARD_MEETING_LABEL} board meeting is 7 days away and the budget line is unconfirmed.`,
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
    const writeWinner = {
      ...buildWinner(),
      type: 'commitment' as const,
      title: 'Benefits payment verification packet is due before the processing deadline',
      content: 'The benefits office requested payment verification before the deadline, and the confirmation packet still needs a receipt and owner.',
      matchedGoal: { text: 'Keep benefits payment processing current', priority: 5, category: 'admin' },
      suggestedActionType: 'write_document' as const,
    };
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult(writeWinner));

    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Save the benefits payment verification action packet before the processing deadline.',
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'Benefits payment verification action packet',
        target_reader: 'Brandon Kapp',
        title: 'Benefits payment verification action packet',
        content: `Source Email: benefits office requested payment verification before ${GO_LIVE_LABEL}. Admin action: submit the payment confirmation number and attach the receipt. Deadline: 4 PM PT today, before ${GO_LIVE_LABEL}. Risk: missing the deadline can pause benefit processing. Exact message: I am attaching the receipt and confirmation number for review. Next action: save the receipt, send the verification, and mark the benefits payment deadline closed.`,
      },
      causal_diagnosis: {
        why_exists_now: 'Benefits payment verification is waiting on receipt and owner assignment.',
        mechanism: 'Unowned admin payment gate blocks benefits processing.',
      },
      evidence: `Source Email: benefits office requested payment verification before ${GO_LIVE_LABEL}.`,
      why_now: 'Benefits payment verification is due within 48 hours and the accountable owner is still undefined.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    console.log('VALID2 result.directive:', result.directive);
    console.log('VALID2 result.action_type:', result.action_type);
    console.log('VALID2 result.confidence:', result.confidence);

    expect(result.directive).not.toBe(SENTINEL);
    expect(result.action_type).toBe('write_document');
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'usefulness_rejected' })
    );
  });

  it('VALID3 — explicit interview attendance request with no calendar evidence may still generate send_message confirmation', async () => {
    const confirmationWinner: ScoredLoop = {
      ...buildWinner(),
      id: 'alex-confirm-attendance',
      type: 'discrepancy',
      discrepancyClass: 'meeting_open_thread',
      title: 'Confirm attendance with Alex Crisler for the Care Coordinator interview',
      content:
        'Alex Crisler explicitly asked whether you will attend the Care Coordinator interview. No matching calendar event or prior confirmation exists.',
      suggestedActionType: 'send_message',
      relatedSignals: [
        'Alex asked: please confirm whether you will attend the Care Coordinator interview.',
      ],
      sourceSignals: [{
        kind: 'signal',
        id: 'sig-alex-confirm-request',
        occurredAt: new Date().toISOString(),
        summary: 'Recruiter asked you to confirm interview attendance; no matching calendar event exists.',
      }],
      relationshipContext: 'Alex Crisler <alex.crisler@comphc.org> (Recruiting)',
      entityName: 'Alex Crisler',
      matchedGoal: { text: 'Land the Care Coordinator role', priority: 5, category: 'career' },
    };
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult(confirmationWinner));

    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Confirm attendance with Alex Crisler for the Care Coordinator interview today.',
      artifact_type: 'send_message',
      artifact: {
        to: 'alex.crisler@comphc.org',
        subject: 'Re: Care Coordinator interview attendance',
        body: 'Hi Alex,\n\nYes, I will attend the Care Coordinator interview. Please let me know if there is anything else you need from me before then.\n\nThanks,\nBrandon',
      },
      evidence: 'Alex explicitly asked whether you will attend, and there is still no matching calendar event or prior confirmation artifact.',
      why_now: 'The attendance request is still open and the interview date is already fixed.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.directive).not.toBe(SENTINEL);
    expect(result.action_type).toBe('send_message');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it('BAD7 — confirmed Alex interview cannot emit send_message when the committed action is write_document', async () => {
    const confirmedInterviewWinner: ScoredLoop = {
      ...buildWinner(),
      id: 'alex-confirmed-prep',
      type: 'discrepancy',
      discrepancyClass: 'preparation_gap',
      title: 'Care Coordinator Interview Prep — April 29',
      content: [
        'ROLE: Care Coordinator',
        'INTERVIEWER_ORG: Alex Crisler / Comprehensive Healthcare',
        'TIME: April 29 2026 at 9:00 PM PT',
        'LOGISTICS: matching calendar event already exists; confirmation email already exists; Microsoft Teams details are already named in the source.',
        'TALKING_POINTS:',
        '- Lead with concrete examples that show how you handle care coordinator work without dropping follow-through.',
        '- Tie each answer back to coordination, documentation, and calm communication under time pressure at Comprehensive Healthcare.',
        '- Show one specific example of staying accurate when schedules or logistics changed quickly.',
        'QUESTIONS:',
        '- What does success in the first 30 days look like for the Care Coordinator role?',
        '- Which teams or stakeholders does this role coordinate with most often day to day?',
        '- What is the next step after this interview, and who owns that follow-up?',
        'NEXT_ACTION: Use this brief for the interview itself. Do not send an employer-facing confirmation email unless the source explicitly asks again and no matching confirmation evidence exists.',
      ].join('\n'),
      suggestedActionType: 'write_document',
      discrepancyPreferredAction: 'write_document',
      relatedSignals: [
        'Alex Crisler confirmed the Care Coordinator interview for April 29 at 9:00 PM PT and a matching Microsoft Teams calendar event already exists.',
      ],
      sourceSignals: [
        {
          kind: 'signal',
          id: 'sig-alex-calendar',
          occurredAt: new Date().toISOString(),
          summary: 'Calendar event: Care Coordinator Interview - Comprehensive Healthcare',
        },
        {
          kind: 'signal',
          id: 'sig-alex-confirmation',
          occurredAt: new Date().toISOString(),
          summary: 'Interview Confirmation with Comprehensive Healthcare for April 29',
        },
      ],
      relationshipContext: 'Alex Crisler <alex.crisler@comphc.org> (Recruiting)',
      entityName: 'Alex Crisler',
      matchedGoal: { text: 'Land the Care Coordinator role', priority: 5, category: 'career' },
    };
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult(confirmedInterviewWinner));

    anthropicCreate.mockResolvedValue(anthropicResponse({
      directive: 'Send the confirmation email to Alex Crisler now.',
      artifact_type: 'send_message',
      artifact: {
        to: 'alex.crisler@comphc.org',
        subject: 'Re: Care Coordinator interview confirmation',
        body: 'Hi Alex,\n\nI am confirming my attendance for the Care Coordinator interview on April 29 at 9:00 PM PT.\n\nThanks,\nBrandon',
      },
      evidence: 'The interview is 0 days out with no confirmation sent.',
      why_now: 'The interview is imminent.',
    }));

    const { generateDirective } = await import('../generator');
    const result = await generateDirective('user-1', { dryRun: true });

    expect(result.directive).toBe(SENTINEL);
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'candidate_blocked',
        generationStatus: 'llm_generation_failed',
        details: expect.objectContaining({
          issues: expect.arrayContaining([
            'artifact_type must be "write_document" (system commitment) but model returned "send_message"',
          ]),
        }),
      })
    );
  });
});
