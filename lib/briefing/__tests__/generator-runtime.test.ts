import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredLoop, ScorerResult, ScorerResultWinnerSelected } from '../scorer';
import {
  expectDirectiveShape,
  expectDocumentArtifactShape,
  expectEmailArtifactShape,
} from '@/test/generated-output-assertions';

const FIXED_NOW = new Date('2026-04-20T15:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDateFromFixedNow(offsetDays: number): string {
  return new Date(FIXED_NOW.getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function weekdayIsoDateFromFixedNow(offsetDays: number): string {
  const date = new Date(FIXED_NOW.getTime() + offsetDays * DAY_MS);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday} ${date.toISOString().slice(0, 10)}`;
}

function buildPartnerDirectiveText(offsetDays = 4): string {
  return `Please email partner@example.com by ${weekdayIsoDateFromFixedNow(offsetDays)} to confirm the Q2 delivery plan and deadline.`;
}

const mockScoreOpenLoops = vi.fn<() => Promise<ScorerResult>>();
const mockIsOverDailyLimit = vi.fn<() => Promise<boolean>>();
const mockTrackApiCall = vi.fn<() => Promise<void>>();
const mockResearchWinner = vi.fn<() => Promise<null>>();
const mockRunConvictionEngine = vi.fn<() => Promise<null>>();
const mockGetDirectiveConstraintViolations = vi.fn();
const mockGetPinnedConstraintPrompt = vi.fn();
const mockLogStructuredEvent = vi.fn();
const mockDecryptWithStatus = vi.fn((_value: unknown) => ({ plaintext: String(_value), usedFallback: false }));

const queryResult = { data: [], error: null };
const tkgActionsResultsQueue: Array<{ data: unknown[]; error: null }> = [];
const lockedConstraintsQueue: Array<{ data: unknown[]; error: null }> = [];
const signalSelectCalls: string[] = [];
const signalLimitCalls: number[] = [];
const signalInCalls: Array<{ column: string; values: unknown[] }> = [];

// Qualifying signal: received email 72h ago — satisfies all 4 discrepancy gate filters.
// Subject header required for parseSignalSnippet + buildAvoidanceObservations no-reply detection.
const SIGNAL_72H_AGO = new Date(FIXED_NOW.getTime() - 72 * 3600000).toISOString();
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
    select(columns?: string) {
      signalSelectCalls.push(String(columns ?? ''));
      return {
        in(column: string, values: unknown[]) {
          signalInCalls.push({
            column,
            values: Array.isArray(values) ? [...values] : [values],
          });
          return Promise.resolve(signalQueryResult);
        },
        eq() { return this; },
        neq() { return this; },
        gte() { return this; },
        not() { return this; },
        is() { return this; },
        order() { return this; },
        limit(count: number) {
          signalLimitCalls.push(count);
          return Promise.resolve(signalQueryResult);
        },
      };
    },
  };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'tkg_actions' || table === 'tkg_goals' || table === 'tkg_entities') {
        return {
          select() {
            return makeLimitQuery(table);
          },
        };
      }

      if (table === 'tkg_signals') {
        return makeSignalsQuery();
      }

      if (table === 'tkg_constraints') {
        const result = lockedConstraintsQueue.shift() ?? { data: [], error: null };
        // Make the chain thenable so `await supabase.from('tkg_constraints').select().eq().eq().eq()`
        // resolves to { data, error } regardless of how many .eq() calls are chained.
        const builder: Record<string, unknown> & { then: (resolve: (r: unknown) => void) => void } = {
          eq() { return builder; },
          then(resolve: (r: unknown) => void) { resolve(result); },
        };
        return { select() { return builder; } };
      }

      throw new Error(`Unexpected table ${table}`);
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

vi.mock('@/lib/utils/api-tracker', () => ({
  isOverDailyLimit: mockIsOverDailyLimit,
  trackApiCall: mockTrackApiCall,
}));

vi.mock('@/lib/briefing/researcher', () => ({
  researchWinner: mockResearchWinner,
}));

vi.mock('../conviction-engine', () => ({
  runConvictionEngine: mockRunConvictionEngine,
}));

vi.mock('@/lib/briefing/pinned-constraints', () => ({
  getDirectiveConstraintViolations: mockGetDirectiveConstraintViolations,
  getPinnedConstraintPrompt: mockGetPinnedConstraintPrompt,
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: mockLogStructuredEvent,
}));

// Encryption mock — buildAvoidanceObservations calls decryptWithStatus on signal content.
// Return correct shape { plaintext, usedFallback } so the no-reply observer works.
vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: mockDecryptWithStatus,
}));

const anthropicCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: anthropicCreate,
    };
  },
}));

function buildWinner(): ScoredLoop {
  return {
    id: 'loop-1',
    type: 'signal',
    title: 'Follow up with the MAS3 hiring manager before the interview window closes',
    content: 'The MAS3 hiring manager still has not replied, and the interview window closes this week.',
    suggestedActionType: 'send_message',
    matchedGoal: {
      text: 'Land the MAS3 role',
      priority: 5,
      category: 'career',
    },
    score: 4.8,
    breakdown: {
      stakes: 5,
      urgency: 0.92,
      tractability: 0.81,
      freshness: 0.94,
      actionTypeRate: 0.5,
      entityPenalty: 0,
    },
    relatedSignals: ['Hiring manager has not responded to the last thread.'],
    sourceSignals: [
      {
        kind: 'signal',
        id: 'sig-1',
        occurredAt: new Date().toISOString(),
        summary: 'MAS3 hiring manager thread',
      },
    ],
    relationshipContext: '- MAS3 Hiring Manager <manager@mas3corp.com> (Hiring)',
    confidence_prior: 72,
  };
}

function asWinnerScored(sr: ScorerResult): ScorerResultWinnerSelected {
  if (sr.outcome !== 'winner_selected') {
    throw new Error('expected winner_selected');
  }
  return sr;
}

function buildScorerResult(): ScorerResult {
  const w = buildWinner();
  return {
    outcome: 'winner_selected',
    winner: w,
    topCandidates: [w],
    deprioritized: [],
    candidateDiscovery: {
      candidateCount: 3,
      suppressedCandidateCount: 0,
      selectionMargin: 0.8,
      selectionReason: 'Selected because score 4.8 beat the next-best candidate.',
      failureReason: null,
      topCandidates: [],
    },
    antiPatterns: [],
    divergences: [],
    exact_blocker: null,
  };
}

describe('generateDirective runtime failures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    vi.resetModules();
    mockScoreOpenLoops.mockReset();
    mockIsOverDailyLimit.mockReset();
    mockTrackApiCall.mockReset();
    mockResearchWinner.mockReset();
    mockRunConvictionEngine.mockReset();
    mockGetDirectiveConstraintViolations.mockReset();
    mockGetPinnedConstraintPrompt.mockReset();
    mockLogStructuredEvent.mockReset();
    mockDecryptWithStatus.mockClear();
    anthropicCreate.mockReset();
    tkgActionsResultsQueue.length = 0;
    lockedConstraintsQueue.length = 0;
    signalSelectCalls.length = 0;
    signalLimitCalls.length = 0;
    signalInCalls.length = 0;
    signalQueryResult.data = [qualifyingSignal];
    signalQueryResult.error = null;

    mockIsOverDailyLimit.mockResolvedValue(false);
    mockResearchWinner.mockResolvedValue(null);
    mockRunConvictionEngine.mockResolvedValue(null);
    mockGetDirectiveConstraintViolations.mockReturnValue([]);
    mockGetPinnedConstraintPrompt.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function queueTkgActionsResult(data: unknown[]): void {
    tkgActionsResultsQueue.push({ data, error: null });
  }

  function queueLockedConstraints(rows: { normalized_entity: string }[]): void {
    lockedConstraintsQueue.push({ data: rows, error: null });
  }

  function queueEmptyTkgActionsResults(count: number): void {
    for (let i = 0; i < count; i += 1) {
      queueTkgActionsResult([]);
    }
  }

  async function advanceJsonParseRetryTimers(delayCount: number): Promise<void> {
    for (let i = 0; i < delayCount; i += 1) {
      for (let spin = 0; spin < 50 && vi.getTimerCount() === 0; spin += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      await vi.advanceTimersByTimeAsync(500);
    }
  }

  it(
    'falls back at generation stage when the LLM request throws',
    async () => {
      mockScoreOpenLoops.mockResolvedValue(buildScorerResult());
      anthropicCreate.mockRejectedValue(
        new Error('400 {"type":"error","error":{"message":"credit balance too low"}}'),
      );

      const { generateDirective } = await import('../generator');
      const directive = await generateDirective('user-1', { dryRun: true });

      // Candidate fallback: LLM failure → candidate blocked → all candidates exhausted → emptyDirective
      expect(directive.directive).toBe('__GENERATION_FAILED__');
      expect(directive.generationLog?.stage).toBe('validation');
      expect(directive.generationLog?.reason).toContain('credit balance too low');
    },
    20_000,
  );

  it('falls through to the next candidate when persistence validation blocks recursive decision-memo sludge', async () => {
    const scored = asWinnerScored(buildScorerResult());
    const blockedCandidate: ScoredLoop = {
      ...buildWinner(),
      id: 'blocked-resend-loop',
      title: 'High-value relationship at risk: onboarding@resend.dev',
      content: 'Ownership on the onboarding@resend.dev relationship still has not been resolved.',
      suggestedActionType: 'write_document',
      score: 5.2,
      relationshipContext: null,
    };
    const fallbackCandidate: ScoredLoop = {
      ...buildWinner(),
      id: 'fallback-partner-loop',
      title: 'Confirm the Q2 delivery plan with the partner before Friday',
      content: 'The Q2 delivery plan is still missing a yes/no from the external partner.',
      score: 4.7,
      relationshipContext: '- Partner <partner@example.com> (Partner)',
    };
    scored.winner = blockedCandidate;
    scored.topCandidates = [blockedCandidate, fallbackCandidate];
    scored.candidateDiscovery = {
      ...scored.candidateDiscovery,
      candidateCount: 2,
      selectionReason: 'Selected because score 5.2 beat the next-best candidate.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueEmptyTkgActionsResults(10);

    anthropicCreate
      .mockResolvedValueOnce({
        usage: { input_tokens: 120, output_tokens: 90 },
        content: [{
          type: 'text',
          text: JSON.stringify({
            directive:
              'Write a decision memo on "High-value relationship at risk: onboarding@resend.dev" — lock the final decision and owner for "High-value relationship at risk: onboarding@resend.dev" by end of day PT on 2026-04-26.',
            artifact_type: 'write_document',
            artifact: {
              document_purpose: 'proposal',
              target_reader: 'decision owner',
              title: 'Decision lock: High-value relationship at risk: onboarding@resend.dev',
              content: [
                'Decision required for "High-value relationship at risk: onboarding@resend.dev": confirm the path, name one owner, and time-bound the commitment.',
                '',
                'Ask: lock the final decision and owner for "High-value relationship at risk: onboarding@resend.dev" by end of day PT on 2026-04-26.',
                '',
                'Consequence: if unresolved by end of day PT on 2026-04-26, the execution window closes before owners can act.',
              ].join('\n'),
            },
            evidence: 'The onboarding@resend.dev relationship is at risk.',
            why_now: 'The time window expires faster than ownership is being assigned.',
            causal_diagnosis: {
              why_exists_now: 'Decision latency is still larger than the remaining execution window.',
              mechanism: 'Ownership remains implicit while the deadline keeps approaching.',
            },
          }),
        }],
      })
      .mockResolvedValueOnce({
        usage: { input_tokens: 120, output_tokens: 90 },
        content: [{
          type: 'text',
          text: JSON.stringify({
            directive: buildPartnerDirectiveText(),
            artifact_type: 'send_message',
            artifact: {
              to: 'partner@example.com',
              subject: 'Q2 delivery plan confirmation',
              body: [
                'Hi,',
                '',
                `Can you confirm by ${weekdayIsoDateFromFixedNow(4)} whether the Q2 delivery plan is final and who owns the last open dependency? If we miss that window, the delivery handoff slips.`,
                '',
                'Thanks,',
                'Brandon',
              ].join('\n'),
            },
            evidence: 'The partner still has not confirmed the Q2 delivery plan.',
            why_now: 'The deadline is this week and the handoff cannot move without a yes/no.',
            causal_diagnosis: {
              why_exists_now: 'The plan is blocked on an external yes/no answer.',
              mechanism: 'A concrete delivery deadline is approaching without named ownership.',
            },
          }),
        }],
      });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('send_message');
    expect(
      (directive as { winnerSelectionTrace?: { finalWinnerId: string } }).winnerSelectionTrace?.finalWinnerId,
    ).toBe('fallback-partner-loop');
    expectEmailArtifactShape(
      (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact,
      {
        expectedRecipient: 'partner@example.com',
        minSubjectLength: 12,
        minBodyLength: 80,
        requireQuestion: true,
      },
    );
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_blocked',
      generationStatus: 'persistence_validation_failed',
      details: expect.objectContaining({
        candidate_title: 'High-value relationship at risk: onboarding@resend.dev',
        issues: expect.arrayContaining(['decision_enforcement:recursive_directive_template_sludge']),
      }),
    }));
  });

  it('falls through when the owner money-shot gate blocks confirmation-email sludge', async () => {
    const scored = asWinnerScored(buildScorerResult());
    const blockedCandidate: ScoredLoop = {
      ...buildWinner(),
      id: 'blocked-chc-alex-confirmation-doc',
      type: 'commitment',
      suggestedActionType: 'write_document',
      title: 'CHC bridge-job response from Alex needs a decision brief',
      content: 'Alex from CHC asked for availability this week; the useful artifact is a decision brief for Brandon, not a confirmation email draft stored as a document.',
      entityName: 'Alex Crisler',
      matchedGoal: {
        text: 'Protect the higher-upside interview week while keeping CHC warm',
        priority: 5,
        category: 'career',
      },
      relationshipContext: '- Alex Crisler <Alex.Crisler@comphc.org> (CHC)',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'sig-chc-alex',
          summary: 'Alex Crisler at CHC asked for Brandon availability this week.',
          occurredAt: FIXED_NOW.toISOString(),
        },
      ],
    };
    const fallbackCandidate: ScoredLoop = {
      ...blockedCandidate,
      id: 'good-chc-decision-brief',
      title: 'CHC bridge-job availability decision before interview week',
      content: 'Alex from CHC asked for availability this week while the interview window is constrained; the useful artifact is a finished decision brief.',
      entityName: 'Alex Crisler',
      relationshipContext: '- Alex Crisler <Alex.Crisler@comphc.org> (CHC)',
      score: 4.9,
      sourceSignals: [
        {
          kind: 'signal',
          id: 'sig-chc-alex-decision',
          summary: 'Alex Crisler at CHC asked for Brandon availability this week while interview preparation time is constrained.',
          occurredAt: FIXED_NOW.toISOString(),
        },
      ],
    };
    scored.winner = blockedCandidate;
    scored.topCandidates = [blockedCandidate, fallbackCandidate];
    scored.candidateDiscovery = {
      ...scored.candidateDiscovery,
      candidateCount: 2,
      selectionReason: 'Selected because CHC confirmation ranked first before quality gating.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueEmptyTkgActionsResults(12);

    anthropicCreate
      .mockResolvedValueOnce({
        usage: { input_tokens: 120, output_tokens: 90 },
        content: [{
          type: 'text',
          text: JSON.stringify({
            directive: 'Create the CHC bridge-job decision brief from Alex Crisler availability note today.',
            artifact_type: 'write_document',
            artifact: {
              document_purpose: 'brief',
              target_reader: 'private notes',
              title: 'Confirmation Email to Alex Crisler — CHC availability',
              content: [
                'Source Email: Alex Crisler at CHC asked for Brandon availability this week.',
                'Decision: reply today after preserving the higher-upside interview window.',
                'Deciding criterion: keep CHC warm without giving away interview preparation time.',
                'Owner: Brandon owns the reply boundary and should not let an open availability ask cannibalize the interview window.',
                'Next action: send this confirmation by 4 PM PT today.',
                'Consequence: if unresolved by 4 PM PT today, CHC gets a vague answer and the interview window loses protected preparation time.',
                'Mechanism: decision latency is now larger than the remaining execution window, so the decision has to close before availability expands by default.',
                'To: Alex.Crisler@comphc.org',
                'Subject: CHC availability this week',
                'Hi Alex,',
                '',
                'Thank you for reaching out. I can confirm availability after the interview window closes this week and will send exact times by 4 PM PT today.',
                '',
                'Thanks,',
                'Brandon',
              ].join('\n'),
            },
            evidence: 'Alex Crisler at CHC asked for Brandon availability this week.',
            why_now: 'The CHC response needs a decision today, but a document must not be an email draft in disguise.',
            causal_diagnosis: {
              why_exists_now: 'The availability ask is open while interview preparation time is constrained.',
              mechanism: 'Competing opportunity window with a same-day response decision.',
            },
          }),
        }],
      })
      .mockResolvedValue({
        usage: { input_tokens: 120, output_tokens: 90 },
        content: [{
          type: 'text',
          text: JSON.stringify({
            directive: 'Use the CHC bridge-job decision brief today before giving Alex availability.',
            artifact_type: 'write_document',
            artifact: {
              document_purpose: 'brief',
              target_reader: 'private notes',
              title: 'CHC bridge-job availability decision',
              content: [
                'Source Email: Alex Crisler at CHC asked for Brandon availability this week.',
                'Decision: decline any CHC availability that overlaps the higher-upside interview window this week.',
                'Deciding criterion: preserve interview preparation time while keeping CHC warm for later availability.',
                'Owner: Brandon owns the reply boundary and should not let an open availability ask cannibalize the interview window.',
                'Next action: reply to Alex today with availability after the interview window closes.',
                'Deadline: send the availability note by 4 PM PT today.',
                'Consequence: if unresolved by 4 PM PT today, CHC gets a vague answer and the interview window loses protected preparation time.',
                'Mechanism: decision latency is now larger than the remaining execution window, so the decision has to close before availability expands by default.',
                'Trigger: if CHC needs coverage before the interview window closes, decline that slot and offer the next open time.',
              ].join('\n'),
            },
            evidence: 'Alex Crisler at CHC asked for Brandon availability this week while interview preparation time is constrained.',
            why_now: 'The CHC availability answer is due today and the decision boundary is whether to protect the interview window.',
            causal_diagnosis: {
              why_exists_now: 'The availability ask is open while interview preparation time is constrained.',
              mechanism: 'Competing opportunity window with a same-day response decision.',
            },
          }),
        }],
      });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(anthropicCreate).toHaveBeenCalled();
    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('write_document');
    expect(
      (directive as { winnerSelectionTrace?: { finalWinnerId: string } }).winnerSelectionTrace?.finalWinnerId,
    ).toBe('good-chc-decision-brief');
    expect(directive.artifactQualityReceipt?.final_artifact_bar_passed).toBe(true);
    expectDocumentArtifactShape(
      (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact,
      {
        minTitleLength: 20,
        minLength: 250,
        requiredRegexes: [/Source Email: Alex Crisler/i, /Decision:/i, /Next action:/i, /Deadline:/i],
      },
    );
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_blocked',
      generationStatus: 'artifact_quality_gate_failed',
      details: expect.objectContaining({
        candidate_title: 'CHC bridge-job response from Alex needs a decision brief',
        reasons: expect.arrayContaining(['action_type_mismatch']),
      }),
    }));
  });

  it('runs the artifact quality gate for non-owner write_document artifacts', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner = {
      ...buildWinner(),
      id: 'blocked-generic-confirmation-doc',
      type: 'commitment',
      suggestedActionType: 'write_document',
      title: 'Vendor onboarding confirmation needs a decision brief',
      content: 'The vendor onboarding handoff still needs a finished decision brief before the Friday cutoff.',
      entityName: 'Morgan Lee',
      matchedGoal: {
        text: 'Close vendor onboarding without loose ends',
        priority: 5,
        category: 'operations',
      },
      relationshipContext: '- Morgan Lee <morgan@example.com> (Vendor)',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'sig-vendor-onboarding',
          summary: 'Morgan Lee asked Brandon to confirm whether vendor onboarding can proceed before Friday.',
          occurredAt: FIXED_NOW.toISOString(),
        },
      ],
    };
    scored.topCandidates = [scored.winner];
    scored.candidateDiscovery = {
      ...scored.candidateDiscovery,
      candidateCount: 1,
      selectionReason: 'Selected because the vendor onboarding confirmation ranked first.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueEmptyTkgActionsResults(8);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Create the vendor onboarding decision brief before Friday.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'brief',
            target_reader: 'Brandon',
            title: 'Confirmation Email to Morgan Lee - vendor onboarding',
            content: [
              'Source Email: Morgan Lee asked Brandon to confirm whether vendor onboarding can proceed before Friday.',
              'Decision: send the vendor onboarding confirmation before the Friday cutoff.',
              'Deciding criterion: Morgan needs a clear yes/no so the vendor handoff does not stall.',
              'Owner: Brandon owns the final onboarding confirmation.',
              'Next action: send the confirmation note today.',
              'Consequence: if unresolved by Friday, the vendor handoff stalls before owners can act.',
              'Mechanism: decision latency is now larger than the remaining execution window, so the decision has to close before the handoff expands by default.',
              'To: morgan@example.com',
              'Subject: Vendor onboarding confirmation',
              'Hi Morgan,',
              '',
              'Can you confirm the vendor onboarding packet is ready to proceed before Friday? If the packet is not ready, please name the remaining blocker and owner so I can close the loop today.',
              '',
              'Thanks,',
              'Brandon',
            ].join('\n'),
          },
          evidence: 'Morgan Lee asked Brandon to confirm vendor onboarding before Friday.',
          why_now: 'The vendor onboarding cutoff is this week.',
          causal_diagnosis: {
            why_exists_now: 'The handoff is waiting on Brandon to confirm the path.',
            mechanism: 'A Friday cutoff creates decision pressure.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).toBe('__GENERATION_FAILED__');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_blocked',
      generationStatus: 'artifact_quality_gate_failed',
      details: expect.objectContaining({
        candidate_title: 'Vendor onboarding confirmation needs a decision brief',
        reasons: expect.arrayContaining(['action_type_mismatch']),
      }),
    }));
  });

  it('blocks owner-shaped relationship-silence decision artifacts instead of persisting fake obligations', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner = {
      ...buildWinner(),
      id: 'blocked-chc-relationship-silence-map',
      type: 'commitment',
      suggestedActionType: 'write_document',
      title: 'CHC silence relationship decision map',
      content: 'CHC has not replied for 19 days, but no current job, interview, benefits, payment, admin deadline, or calendar conflict requires a finished artifact.',
      entityName: 'CHC',
      relationshipContext: '- CHC <updates@comphc.org> (Contact)',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'sig-chc-silence',
          summary: 'CHC updates@comphc.org has not replied for 19 days after a general relationship thread.',
          occurredAt: FIXED_NOW.toISOString(),
        },
      ],
    };
    scored.topCandidates = [scored.winner];
    scored.candidateDiscovery = {
      ...scored.candidateDiscovery,
      candidateCount: 1,
      selectionReason: 'Selected because CHC relationship silence ranked first.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueEmptyTkgActionsResults(8);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Create the CHC relationship silence decision map today.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'brief',
            target_reader: 'Brandon',
            title: 'CHC relationship silence decision map',
            content: [
              'Source Email: CHC has not replied for 19 days after a general update thread.',
              'Decision: decide today whether this CHC relationship is still active or whether you have moved on.',
              'Criteria: because silence may create professional risk if the relationship is not addressed before external decisions are final.',
              'Owner: Brandon owns the decision not to convert this silence into a fake obligation.',
              'Deadline: today.',
              'Next action: resolve the CHC status before any external decision is final.',
            ].join('\n'),
          },
          evidence: 'CHC has not replied for 19 days.',
          why_now: 'The relationship silence is unresolved.',
          causal_diagnosis: {
            why_exists_now: 'A general contact has not replied.',
            mechanism: 'Relationship silence without a real deadline or opportunity.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).toBe('__GENERATION_FAILED__');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_blocked',
      generationStatus: 'artifact_quality_gate_failed',
      details: expect.objectContaining({
        candidate_title: 'CHC silence relationship decision map',
        reasons: expect.arrayContaining(['relationship_silence_artifact']),
      }),
    }));
  });

  it('maps scorer no_valid_action to a deterministic blocker (not GENERATION_FAILED)', async () => {
    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'no_valid_action',
      winner: null,
      topCandidates: [],
      deprioritized: [],
      candidateDiscovery: {
        candidateCount: 1,
        suppressedCandidateCount: 0,
        selectionMargin: null,
        selectionReason: null,
        failureReason: 'Every candidate failed the final authorization bar.',
        topCandidates: [],
      },
      antiPatterns: [],
      divergences: [],
      exact_blocker: {
        blocker_type: 'no_valid_action_final_gate',
        blocker_reason: 'Every candidate failed the final authorization bar.',
        top_blocked_candidate_title: 'Noise: shipping notification',
        top_blocked_candidate_type: 'signal',
        top_blocked_candidate_action_type: 'send_message',
        suppression_goal_text: null,
        survivors_before_final_gate: 0,
        rejected_by_stage: { final_gate: 1 },
      },
    });
    const { generateDirective } = await import('../generator');
    const d = await generateDirective('user-1', { dryRun: true });
    expect(d.directive).not.toBe('__GENERATION_FAILED__');
    expect(d.action_type).toBe('do_nothing');
    expect(d.generationLog?.no_valid_action_blocker).toBe(true);
    expect((d as { embeddedArtifact?: { type?: string } }).embeddedArtifact?.type).toBe('wait_rationale');
  });

  it('skips research below the winner-score threshold and logs the triggering score', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.score = 1.9;
    mockScoreOpenLoops.mockResolvedValue(scored);
    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Send the follow-up email to the MAS3 hiring manager today.',
          artifact_type: 'send_message',
          artifact: {
            to: 'manager@mas3corp.com',
            subject: 'MAS3 timeline follow-up',
            body: 'Hi,\n\nI wanted to follow up on the MAS3 interview timeline.\n\nThank you,\nBrandon',
          },
          evidence: 'The interview window closes this week and the manager has not replied.',
          why_now: 'The timing window closes this week.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    await generateDirective('user-1', { dryRun: true });

    // The candidate loop silently skips research when score < 2.0 — no event is emitted,
    // but researchWinner must NOT have been called.
    expect(mockResearchWinner).not.toHaveBeenCalled();
  });

  it('pipelineDryRun skips signal content hydration entirely', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult());
    queueEmptyTkgActionsResults(4);

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true, pipelineDryRun: true });

    expect(signalSelectCalls).toEqual([]);
    expect(signalLimitCalls).toEqual([]);
    expect(signalInCalls).toEqual([]);
    expect(mockDecryptWithStatus).not.toHaveBeenCalled();
  });

  it('falls through to fallback candidates when the first viable winner fails post-LLM validation', async () => {
    const scored = asWinnerScored(buildScorerResult());
    const runner = buildWinner();
    runner.id = 'loop-2';
    runner.title = 'Reply to the backup hiring thread before the slot closes';
    runner.content = 'The backup hiring thread still needs a direct reply before the slot closes.';
    runner.relationshipContext = '- Backup Hiring Manager <backup@mas3corp.com> (Hiring)';
    runner.sourceSignals = [
      {
        kind: 'signal',
        id: 'sig-2',
        occurredAt: new Date(FIXED_NOW.getTime() - DAY_MS).toISOString(),
        summary: 'Backup hiring manager thread',
      },
    ];
    scored.topCandidates = [scored.winner, runner];

    mockScoreOpenLoops.mockResolvedValue(scored);
    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Send a quick check-in to the MAS3 hiring manager today.',
          artifact_type: 'send_message',
          artifact: {
            to: 'manager@mas3corp.com',
            subject: 'Quick check-in',
            body: 'Hi,\n\nJust checking in on the MAS3 process.\n\nBest,\nBrandon',
          },
          evidence: 'The manager has not replied yet.',
          why_now: 'A response is still pending.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    // Post-LLM failure-path gates now use `continue;` so the candidate fallback loop
    // actually tries the next ranked candidate when the first winner fails validation.
    // With 2 candidates and per-candidate LLM retry (2 attempts each), the total
    // Anthropic call count is 4 — not 2. The pre-fix behavior used `break;` on the
    // first post-LLM failure and never hydrated or invoked the second candidate.
    // Candidate 2 (backup hiring thread) then succeeds because its causal-diagnosis
    // context matches the mocked send_message artifact, so the final directive is a
    // real send_message rather than the old do_nothing that resulted from the loop
    // dying prematurely.
    expect(signalSelectCalls.length).toBeGreaterThan(0);
    expect(anthropicCreate).toHaveBeenCalledTimes(4);
    expect(directive.action_type).toBe('send_message');
  });

  it('caps directive candidate generation attempts at three ranked candidates', async () => {
    const candidates = Array.from({ length: 5 }, (_unused, index) => ({
      ...buildWinner(),
      id: `loop-${index + 1}`,
      title: `External decision thread ${index + 1} needs a yes/no before Friday`,
      content: `External decision thread ${index + 1} still needs a direct yes/no before Friday.`,
      relationshipContext: `- Decision Partner ${index + 1} <partner${index + 1}@example.com> (Partner)`,
      sourceSignals: [
        {
          kind: 'signal' as const,
          id: `sig-${index + 1}`,
          occurredAt: new Date(FIXED_NOW.getTime() - (index + 1) * 60 * 60 * 1000).toISOString(),
          summary: `Decision partner ${index + 1} asked for a Friday answer.`,
        },
      ],
      score: 5 - (index * 0.1),
    }));
    const scored = asWinnerScored(buildScorerResult());
    scored.winner = candidates[0]!;
    scored.topCandidates = candidates;
    scored.candidateDiscovery = {
      ...scored.candidateDiscovery,
      candidateCount: candidates.length,
      selectionReason: 'Five viable candidates ranked before generator attempt cap.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Ask the partner to confirm the decision owner by 4 PM PT today.',
          artifact_type: 'send_message',
          artifact: {
            to: 'partner@example.com',
            subject: 'Decision owner needed today',
            body: 'Hi,\n\nCan you confirm by 4 PM PT today who owns the approval decision? If we miss Friday, the filing window slips and creates a $999,999 budget risk.\n\nBest,\nBrandon',
          },
          evidence: 'The partner asked for a Friday decision owner.',
          why_now: 'Friday is the decision deadline and no owner is confirmed.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(anthropicCreate).toHaveBeenCalledTimes(3);
    expect(directive.action_type).toBe('do_nothing');
    expect(directive.generationLog?.reason).toContain('Attempted 3 of 5 candidates');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'all_candidates_blocked',
        details: expect.objectContaining({
          candidate_count: 3,
          ranked_candidate_count: 5,
          candidate_attempt_cap: 3,
        }),
      }),
    );
  });

  it('excludes verification-stub rows from RECENT_ACTIONS_7D in the Anthropic prompt', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.entityName = 'Jane Smith';
    scored.winner.title = 'Follow up with Jane about the proposal';
    scored.winner.content = 'Jane has not responded to the proposal.';
    scored.winner.relationshipContext = '- Jane Smith <jane@example.com> (Contact)';
    mockScoreOpenLoops.mockResolvedValue(scored);
    queueTkgActionsResult([
      {
        directive_text: 'REAL APPROVED ACTION stays in recent history',
        action_type: 'send_message',
        generated_at: new Date(FIXED_NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        execution_result: {
          outcome_type: 'pending_approval',
        },
      },
      {
        directive_text: 'FAKE STUB APPROVED ACTION should disappear',
        action_type: 'write_document',
        generated_at: new Date(FIXED_NOW.getTime() - 60 * 60 * 1000).toISOString(),
        execution_result: {
          verification_stub_persist: true,
        },
      },
    ]);
    queueTkgActionsResult([
      {
        directive_text: 'REAL SKIPPED ACTION stays in recent history',
        action_type: 'send_message',
        generated_at: new Date(FIXED_NOW.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        skip_reason: 'recipient_unavailable',
        execution_result: {
          outcome_type: 'skipped',
        },
      },
      {
        directive_text: 'FAKE STUB SKIPPED ACTION should disappear',
        action_type: 'write_document',
        generated_at: new Date(FIXED_NOW.getTime() - 3 * 60 * 60 * 1000).toISOString(),
        skip_reason: 'verification_stub',
        execution_result: {
          verification_stub_persist: true,
        },
      },
    ]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Request Jane\'s yes/no on the proposal by end of day Friday.',
          artifact_type: 'send_message',
          artifact: {
            to: 'jane@example.com',
            subject: 'Proposal decision needed by Friday EOD',
            body: 'Hi Jane,\n\nCan you confirm by end of day Friday whether you\'d like to proceed with the proposal? If we miss this window, the pricing expires and we\'ll need to restart the evaluation.\n\nThanks,\nBrandon',
          },
          evidence: 'Jane has not replied and the proposal pricing expires Friday.',
          why_now: 'Pricing expires end of day Friday — no response means restart from scratch.',
          causal_diagnosis: {
            why_exists_now: 'Jane still has not given a yes/no decision and the proposal pricing expires Friday.',
            mechanism: 'Pending external decision before a pricing deadline.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    await generateDirective('user-1', { dryRun: true });

    const anthropicRequest = anthropicCreate.mock.calls[0]?.[0] as {
      messages?: Array<{ content?: string }>;
    } | undefined;
    const prompt = anthropicRequest?.messages?.[0]?.content ?? '';

    expect(prompt).toContain('REAL APPROVED ACTION stays in recent history');
    expect(prompt).toContain('REAL SKIPPED ACTION stays in recent history');
    expect(prompt).not.toContain('FAKE STUB APPROVED ACTION should disappear');
    expect(prompt).not.toContain('FAKE STUB SKIPPED ACTION should disappear');
  });

  it('hydrates only the first viable winner and caps signal evidence reads to 30 rows', async () => {
    const blockedCandidate = {
      ...buildWinner(),
      id: 'blocked-winner',
      entityName: 'Nicole Vreeland',
      title: 'Follow up with Nicole about the reference letter',
      content: 'Nicole has not responded to the reference letter request.',
      relationshipContext: '- Nicole Vreeland <nicole.vreeland@example.com> (Contact)',
      sourceSignals: [{ kind: 'signal' as const, id: 'blocked-sig-1', summary: 'Blocked thread' }],
    };
    const viableCandidate = {
      ...buildWinner(),
      id: 'viable-winner',
      entityName: 'Alex Morgan',
      title: 'Follow up with Alex Morgan about the permit deadline',
      content: 'Alex Morgan still needs the permit response before Friday.',
      relationshipContext: '- Alex Morgan <alex@example.com> (Partner)',
      sourceSignals: Array.from({ length: 40 }, (_unused, index) => ({
        kind: 'signal' as const,
        id: `viable-sig-${index + 1}`,
        occurredAt: new Date().toISOString(),
        summary: `Viable signal ${index + 1}`,
      })),
    };

    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'winner_selected',
      winner: blockedCandidate,
      topCandidates: [blockedCandidate, viableCandidate],
      deprioritized: [],
      candidateDiscovery: {
        candidateCount: 2,
        suppressedCandidateCount: 0,
        selectionMargin: 0.2,
        selectionReason: 'Blocked candidate ranked first before generator viability checks.',
        failureReason: null,
        topCandidates: [],
      },
      antiPatterns: [],
      divergences: [],
      exact_blocker: null,
    });
    queueLockedConstraints([{ normalized_entity: 'nicole vreeland' }]);
    queueEmptyTkgActionsResults(8);
    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Email Alex Morgan today about the permit deadline.',
          artifact_type: 'send_message',
          artifact: {
            to: 'alex@example.com',
            subject: 'Permit deadline follow-up',
            body: 'Hi Alex,\n\nFollowing up on the permit deadline before Friday.\n\nThanks,\nBrandon',
          },
          evidence: 'Alex Morgan is on the live permit thread and the deadline is this week.',
          why_now: 'The permit deadline is this week.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(anthropicCreate).toHaveBeenCalled();
    expect(signalInCalls).toHaveLength(1);
    expect(signalInCalls[0]?.column).toBe('id');
    expect(signalInCalls[0]?.values).toHaveLength(30);
    expect(signalInCalls[0]?.values).not.toContain('blocked-sig-1');
    expect(mockDecryptWithStatus).toHaveBeenCalled();
  });

  it('uses a bounded fallback evidence scan for decay candidates so older thread rows stay reachable', async () => {
    const decayCandidate: ScoredLoop = {
      ...buildWinner(),
      id: 'decay-alex',
      type: 'discrepancy',
      discrepancyClass: 'decay' as import('../../briefing/discrepancy-detector').DiscrepancyClass,
      title: 'Fading connection: Alex Crisler',
      content: 'Alex scheduled the phone screen and the thread cooled after that point.',
      entityName: 'Alex Crisler',
      relationshipContext: '- Alex Crisler <Alex.Crisler@comphc.org> (Recruiting)',
      sourceSignals: [
        {
          kind: 'signal',
          id: 'alex-calendar',
          occurredAt: new Date().toISOString(),
          summary: 'Phone screen scheduled on the calendar',
        },
      ],
    };

    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'winner_selected',
      winner: decayCandidate,
      topCandidates: [decayCandidate],
      deprioritized: [],
      candidateDiscovery: {
        candidateCount: 1,
        suppressedCandidateCount: 0,
        selectionMargin: 0.2,
        selectionReason: 'Decay candidate selected.',
        failureReason: null,
        topCandidates: [],
      },
      antiPatterns: [],
      divergences: [],
      exact_blocker: null,
    });
    queueEmptyTkgActionsResults(6);
    signalQueryResult.data = [
      qualifyingSignal,
      {
        id: 'alex-email-1',
        content:
          'From: Alex.Crisler@comphc.org\nTo: b-kapp@outlook.com\nSubject: Brandon Kapp - Phone Screen\n\nThis meeting was scheduled from the bookings page of Alex Crisler.',
        source: 'outlook',
        occurred_at: new Date(FIXED_NOW.getTime() - 6 * DAY_MS).toISOString(),
        author: 'Alex.Crisler@comphc.org',
        type: 'email_received',
      },
    ];
    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Email Alex Crisler about the phone screen follow-up.',
          artifact_type: 'send_message',
          artifact: {
            to: 'Alex.Crisler@comphc.org',
            subject: 'Phone screen follow-up',
            body: 'Hi Alex,\n\nAfter the April 15 phone screen, can you share the next-step timeline for Comprehensive Healthcare?\n\nThanks,\nBrandon',
          },
          evidence: 'Alex scheduled the phone screen and the thread cooled after that point.',
          why_now: 'The thread went quiet after the phone screen.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    await generateDirective('user-1', { dryRun: true });

    expect(signalInCalls).toHaveLength(1);
    expect(signalLimitCalls).toContain(150);
  });

  it('skips top-ranked schedule_conflict write_document winner and falls through to the next viable candidate', async () => {
    const blockedCandidate = {
      ...buildWinner(),
      id: 'schedule-conflict-winner',
      type: 'discrepancy' as const,
      discrepancyClass: 'schedule_conflict' as import('../../briefing/discrepancy-detector').DiscrepancyClass,
      suggestedActionType: 'write_document' as const,
      title: 'Overlapping events on 2026-04-25',
      content: '"Babe baby shower" and "N Soccer game" overlap on 2026-04-25.',
      sourceSignals: [{ kind: 'signal' as const, id: 'schedule-conflict-sig', summary: 'Calendar overlap' }],
    };
    const viableCandidate = {
      ...buildWinner(),
      id: 'viable-send-message',
      entityName: 'Alex Morgan',
      title: 'Follow up with Alex Morgan about the permit deadline',
      content: 'Alex Morgan still needs the permit response before Friday.',
      relationshipContext: '- Alex Morgan <alex@example.com> (Partner)',
    };

    mockScoreOpenLoops.mockResolvedValue({
      outcome: 'winner_selected',
      winner: blockedCandidate,
      topCandidates: [blockedCandidate, viableCandidate],
      deprioritized: [],
      candidateDiscovery: {
        candidateCount: 2,
        suppressedCandidateCount: 0,
        selectionMargin: 0.2,
        selectionReason: 'Schedule conflict scored first before generator product-bar checks.',
        failureReason: null,
        topCandidates: [],
      },
      antiPatterns: [],
      divergences: [],
      exact_blocker: null,
    });
    queueEmptyTkgActionsResults(8);
    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Email Alex Morgan today about the permit deadline.',
          artifact_type: 'send_message',
          artifact: {
            to: 'alex@example.com',
            subject: 'Permit deadline follow-up',
            body: 'Hi Alex,\n\nCan you confirm by Friday whether the permit response is still on track? If it slips, the filing window closes.\n\nThanks,\nBrandon',
          },
          evidence: 'Alex Morgan is on the live permit thread and the deadline is this week.',
          why_now: 'The permit deadline is this week.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.action_type).toBe('send_message');
    expect(directive.directive).toContain('Alex Morgan');
    expect(directive.winnerSelectionTrace?.scorerTopDisplacementReason).toBe(
      'artifact_viability:schedule_conflict_write_document_below_bar',
    );
  });

  it('extracts JSON from prefixed non-json fenced responses and logs the raw payload preview', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult());
    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: `Here is the directive:
\`\`\`jsonc
{
  "directive": "Send the follow-up email to the MAS3 hiring manager today.",
  "artifact_type": "send_message",
  "artifact": {
    "to": "manager@mas3corp.com",
    "subject": "MAS3 timeline follow-up",
    "body": "Hi,\\n\\nI wanted to follow up on the MAS3 interview timeline.\\n\\nThank you,\\nBrandon"
  },
  "evidence": "The interview window closes this week and the manager has not replied.",
  "why_now": "The timing window closes this week."
}
\`\`\``,
      }],
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateDirective } = await import('../generator');
    await generateDirective('user-1', { dryRun: true });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[generator] Raw LLM response (attempt 1):'));
    expect(anthropicCreate).toHaveBeenCalledWith(expect.objectContaining({
      max_tokens: 4096,
      system: expect.stringContaining('Return ONLY a JSON object.'),
    }));

    errorSpy.mockRestore();
  });

  it('retries malformed JSON responses twice before accepting a valid artifact', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult());
    const validPayload = {
      directive: 'Email the MAS3 hiring manager today to confirm the interview timeline before the window closes.',
      artifact_type: 'send_message',
      artifact: {
        to: 'manager@mas3corp.com',
        subject: 'MAS3 interview timeline confirmation',
        body: 'Hi,\n\nCan you confirm by Friday whether the MAS3 interview timeline is still on track? If it slips, I lose the scheduling window for the interview follow-through.\n\nThanks,\nBrandon',
      },
      evidence: 'The MAS3 hiring manager thread is open and the interview window closes this week.',
      why_now: 'The interview window closes this week, so confirming the timeline today prevents the process from drifting.',
      causal_diagnosis: {
        why_exists_now: 'The thread has not received a confirming reply while the interview window is still active.',
        mechanism: 'An unanswered hiring timeline question is blocking the next concrete scheduling move.',
      },
    };
    anthropicCreate
      .mockResolvedValueOnce({
        usage: { input_tokens: 100, output_tokens: 20 },
        content: [{ type: 'text', text: '{ "directive": "missing closing brace"' }],
      })
      .mockResolvedValueOnce({
        usage: { input_tokens: 100, output_tokens: 20 },
        content: [{ type: 'text', text: 'not json at all' }],
      })
      .mockResolvedValueOnce({
        usage: { input_tokens: 100, output_tokens: 100 },
        content: [{ type: 'text', text: JSON.stringify(validPayload) }],
      });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateDirective } = await import('../generator');
    const directivePromise = generateDirective('user-1', { dryRun: true });
    await advanceJsonParseRetryTimers(2);
    const directive = await directivePromise;

    expect(directive.action_type).toBe('send_message');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectEmailArtifactShape(embeddedArtifact, {
      expectedRecipient: 'manager@mas3corp.com',
      minSubjectLength: 12,
      minBodyLength: 80,
      requireQuestion: true,
      requiredRegexes: [/confirm/i, /interview timeline/i],
    });
    expect(anthropicCreate).toHaveBeenCalledTimes(3);
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'generation_json_parse_retry',
      generationStatus: 'retrying_json_parse',
    }));

    errorSpy.mockRestore();
  });

  it('logs the actual system error before returning the sentinel fallback', async () => {
    mockScoreOpenLoops.mockRejectedValue(new Error('scoreOpenLoops blew up'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).toBe('__GENERATION_FAILED__');
    expect(directive.generationLog?.stage).toBe('system');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('scoreOpenLoops blew up'),
    );

    errorSpy.mockRestore();
  });

  it('suppresses send_message candidates when the same contact was actioned in the last 7 days', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.title = 'Email Yadira about the project timeline update';
    scored.winner.content = 'Yadira asked for a timeline update and still needs the status summary.';
    scored.winner.relationshipContext = '- Yadira Clapper <yadira@example.com> (Client)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    // loadRecentActionGuardrails() queries
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    // approved send_message actions (5th parallel fetch in generateDirective — sync-lag supplement)
    queueTkgActionsResult([]);
    // voice patterns (6th parallel fetch)
    queueTkgActionsResult([]);
    // recent entity conflict query
    queueTkgActionsResult([
      {
        id: 'action-yadira-1',
        directive_text: 'Email Yadira with the project timeline update',
        execution_result: { artifact: { to: 'yadira@example.com' } },
        generated_at: new Date().toISOString(),
        status: 'executed',
      },
    ]);

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.action_type).toBe('do_nothing');
    expect(directive.reason).toContain('entity_suppressed');
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_skipped_entity_suppression',
      generationStatus: 'recent_entity_action_suppressed',
      details: expect.objectContaining({
        entity_name: expect.stringContaining('Yadira'),
      }),
    }));
  });

  it('suppresses schedule candidates when the same contact was actioned in the last 7 days', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.suggestedActionType = 'schedule';
    scored.winner.title = 'Schedule a focused block with Yadira before Friday';
    scored.winner.content = 'Yadira has not replied and the Friday deadline is near.';
    scored.winner.relationshipContext = '- Yadira Clapper <yadira@example.com> (Client)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    // approved send_message actions (5th parallel fetch — sync-lag supplement)
    queueTkgActionsResult([]);
    // voice patterns (6th parallel fetch)
    queueTkgActionsResult([]);
    queueTkgActionsResult([
      {
        id: 'action-yadira-2',
        directive_text: 'Scheduled follow-up prep with Yadira',
        execution_result: { artifact: { title: 'Yadira follow-up block' } },
        generated_at: new Date().toISOString(),
        status: 'pending_approval',
      },
    ]);

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-2', { dryRun: true });

    expect(directive.action_type).toBe('do_nothing');
    expect(directive.reason).toContain('entity_suppressed');
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('does not suppress send_message when the user\'s own name appears in a recent action body', async () => {
    // Simulate the original bug:
    // A recently-approved action had "Brandon" in its directive text (e.g. "Hi Brandon, the Teo
    // thank-you is approved"). "Brandon" appears in the NEW candidate's content too (e.g. "Brandon
    // asked to follow up with Arman"). Without the fix, "Brandon" gets extracted as a candidate
    // entity from the new winner's narrative, then matches the old action, and suppresses the
    // directive. With the fix, "Brandon" is filtered out (it's the user's own name) so the
    // suppression does NOT fire.
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.title = 'Follow up with Arman on the contract proposal';
    scored.winner.content = 'Arman asked for a status update. Brandon mentioned this was urgent.';
    scored.winner.relatedSignals = ['Brandon asked Arman about the contract status last week.'];
    scored.winner.relationshipContext = '- Arman Petrov <arman.petrov@partnerfirm.io> (Partner)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    // approved send_message actions (5th parallel fetch — sync-lag supplement)
    queueTkgActionsResult([]);
    // voice patterns (6th parallel fetch)
    queueTkgActionsResult([]);
    // Recent action whose directive_text contains "Brandon" (e.g. from a prior signed-off email).
    // Without the fix, "Brandon" extracted from the new candidate narrative above would match this
    // action and suppress generation. With the fix it should be filtered.
    queueTkgActionsResult([
      {
        id: 'action-brandon-mention-1',
        directive_text: 'Brandon approved the Teo thank-you email — send it now.',
        execution_result: { artifact: { to: 'teo.approved@othercorp.com', body: 'Thank you note sent.' } },
        generated_at: new Date().toISOString(),
        status: 'executed',
      },
    ]);
    // checkConsecutiveDuplicate query
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Request Arman\'s yes/no contract decision and owner assignment by 4 PM PT today.',
          artifact_type: 'send_message',
          artifact: {
            to: 'arman.petrov@partnerfirm.io',
            subject: 'Decision needed today: contract path owner by 4 PM PT',
            body: 'Hi Arman,\n\nCan you confirm by 4 PM PT today whether we should proceed with contract path A or B, and name the owner for execution? If we miss this cutoff, legal review slips to next week.\n\nBest,\nBrandon',
          },
          evidence: 'Arman asked for an update and has not received a reply.',
          why_now: 'The unresolved owner blocks legal review and today is the last workable decision window.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    // Should NOT be suppressed — "Brandon" is the user's own name, not a contact entity.
    expect(directive.action_type).not.toBe('do_nothing');
    expect(directive.reason).not.toContain('Brandon');
    expect(anthropicCreate).toHaveBeenCalled();
  });

  it('forces discrepancy winners to default to send_message when recipient context exists', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'discrepancy';
    scored.winner.id = 'discrepancy_deadline_staleness_commitment-1';
    scored.winner.suggestedActionType = 'send_message';
    scored.winner.discrepancyClass = 'deadline_staleness' as import('../../briefing/discrepancy-detector').DiscrepancyClass;
    scored.winner.trigger = {
      baseline_state: 'Active commitment, last updated 5 days ago',
      current_state: '2 day(s) until deadline with no movement',
      delta: '5 days stalled while deadline approaches (2d remaining)',
      timeframe: '5 day stall, 2d to deadline',
      outcome_class: 'deadline' as const,
      why_now: 'Deadline in 2 days and last movement was 5 days ago',
    };
    scored.winner.title = 'Deadline staleness: reviewer deferred approval three times with no owner';
    scored.winner.content = 'Reviewer deferred approval three times and requested an explicit owner by today.';
    scored.winner.relationshipContext = '- Approver Team <approver@example.com> (Final approver)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Request a yes/no decision with owner assignment by 4 PM PT today.',
          artifact_type: 'send_message',
          artifact: {
            to: 'approver@example.com',
            subject: 'Decision needed today: owner + approval path by 4 PM PT',
            body: 'Can you confirm by 4 PM PT today whether we proceed with approval path A or B, and name the owner? If we miss this, the launch packet slips to next week.',
          },
          evidence: 'Approval deferred three times with no owner assignment.',
          why_now: 'Deadline is today and the unresolved owner blocks execution.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('send_message');
  });

  it('repairs decision-enforcement-only failures with a deterministic write_document fallback', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'commitment';
    scored.winner.suggestedActionType = 'write_document';
    scored.winner.title = "Commitment due in 0d: Webinar 'Algoritmo Zero' launch decision";
    scored.winner.content = `Webinar launch ownership is unresolved and cutoff is ${isoDateFromFixedNow(1)}.`;
    scored.winner.relationshipContext = '- Webinar Owner <owner@algoritmozero.com> (Partner)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Write up webinar notes.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'summary',
            target_reader: 'team',
            title: 'Webinar notes',
            content: 'This document summarizes the current webinar status, outstanding prep, and recent thread updates for reference.',
          },
          evidence: 'Webinar launch remains unresolved.',
          why_now: 'Timing is getting tight.',
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    // generatePayload allows 1 validation retry (2 Sonnet calls); same mocked body fails both times, then repair path wins.
    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('write_document');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectDocumentArtifactShape(embeddedArtifact, {
      minTitleLength: 12,
      minLength: 120,
      minParagraphs: 3,
      requiredRegexes: [/decision required/i, /\bask:/i, /\bconsequence:/i, /\bowner\b/i],
    });
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_repaired',
      generationStatus: 'decision_enforcement_repaired',
    }));
  });

  it('repairs weak behavioral_pattern write_document into a long-horizon internal decision move', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'discrepancy';
    scored.winner.discrepancyClass = 'behavioral_pattern' as import('../../briefing/discrepancy-detector').DiscrepancyClass;
    scored.winner.suggestedActionType = 'write_document';
    scored.winner.title = '3 inbound messages to Pat Lee in 14 days, 0 replies after the interview.';
    scored.winner.content = 'The same follow-up gap keeps repeating across this hiring thread.';
    scored.winner.matchedGoal = {
      text: 'pilot decision',
      priority: 4,
      category: 'work',
    };
    scored.winner.trigger = {
      baseline_state: 'Repeated inbound thematic signals across multiple contacts',
      current_state: 'User has not connected the pattern into one consolidated move',
      delta: 'isolated threads → visible cross-signal theme',
      timeframe: '30 days',
      outcome_class: 'risk',
      why_now: 'The same behavioral shape appears in multiple channels — without naming the pattern, each thread feels like a one-off.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Write up the reply-gap pattern for review.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'summary',
            target_reader: 'user',
            title: 'Reply-gap pattern',
            content: 'Pat Lee has gone quiet and the thread needs attention. A short summary of the pattern is below for review before deciding what to do next.',
          },
          evidence: 'Pat Lee has not replied after several follow-ups.',
          why_now: 'The pattern is visible now.',
          causal_diagnosis: {
            why_exists_now: 'Repeated follow-ups are not producing a real yes/no.',
            mechanism: 'Thread stayed open without a closing move.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(anthropicCreate).toHaveBeenCalledTimes(2);
    expect(directive.action_type).toBe('write_document');
    expectDirectiveShape(directive.directive, {
      minLength: 40,
      requiredRegexes: [/reopen/i, /next-step signal/i],
    });
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    const { title } = expectDocumentArtifactShape(embeddedArtifact, {
      minTitleLength: 16,
      minLength: 220,
      minParagraphs: 6,
      requiredTerms: ['pilot decision', 'Pat Lee'],
      requiredRegexes: [
        /Execution move:/i,
        /Why this beats the alternatives:/i,
        /Deprioritize:/i,
        /Reopen trigger:/i,
      ],
    });
    expect(title).toContain('pilot decision');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_repaired',
      generationStatus: 'decision_enforcement_repaired',
    }));
  });

  it('uses the grounded thread label for MAS3-style behavioral-pattern repairs instead of echoing the generated directive', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'discrepancy';
    scored.winner.discrepancyClass = 'behavioral_pattern' as import('../../briefing/discrepancy-detector').DiscrepancyClass;
    scored.winner.suggestedActionType = 'write_document';
    scored.winner.title = "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since";
    scored.winner.content = 'The thread has stayed mentally open even though no concrete next step has landed.';
    scored.winner.matchedGoal = {
      text: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
      priority: 5,
      category: 'career',
    };
    scored.winner.sourceSignals = [
      {
        kind: 'commitment',
        id: 'commitment-mas3',
        occurredAt: new Date().toISOString(),
        summary: 'Waiting on MAS3 (HCA) hiring decision',
      },
    ];
    scored.winner.trigger = {
      baseline_state: 'The hiring-decision thread originally had a concrete outcome boundary.',
      current_state: 'The thread is now mentally open without a grounded next step.',
      delta: 'clear decision window → stale silent thread',
      timeframe: '11 days',
      outcome_class: 'risk',
      why_now: 'The thread is quiet enough that continuing to hold bandwidth open is now more expensive than waiting for a real signal.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Write up the stalled hiring thread for later.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'summary',
            target_reader: 'user',
            title: 'Stalled hiring thread',
            content: 'The MAS3 thread looks stalled. Capture a short summary before deciding what to do next.',
          },
          evidence: 'The thread is still mentally open.',
          why_now: 'The pattern is visible now.',
          causal_diagnosis: {
            why_exists_now: 'Repeated follow-ups are not producing a real yes/no.',
            mechanism: 'The thread stayed open without a closing move.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).toContain('Waiting on MAS3 (HCA) hiring decision');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectDocumentArtifactShape(embeddedArtifact, {
      minTitleLength: 16,
      minLength: 220,
      minParagraphs: 6,
      requiredTerms: ['Waiting on MAS3 (HCA) hiring decision'],
      forbiddenPatterns: [
        'means Stop holding live bandwidth open for',
        'for Stop holding live bandwidth open for',
      ],
    });
  });

  it('rejects behavioral-pattern documents that echo the full directive into the artifact body and repairs them', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'discrepancy';
    scored.winner.discrepancyClass = 'behavioral_pattern' as import('../../briefing/discrepancy-detector').DiscrepancyClass;
    scored.winner.suggestedActionType = 'write_document';
    scored.winner.title = "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since";
    scored.winner.content = "Committed to 'Waiting on MAS3 (HCA) hiring decision' 11 days ago — no activity since";
    scored.winner.matchedGoal = {
      text: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
      priority: 5,
      category: 'career',
    };
    scored.winner.sourceSignals = [
      {
        kind: 'commitment',
        id: 'commitment-mas3',
        occurredAt: new Date().toISOString(),
        summary: 'Waiting on MAS3 (HCA) hiring decision',
      },
    ];
    scored.winner.trigger = {
      baseline_state: 'The hiring-decision thread originally had a concrete outcome boundary.',
      current_state: 'The thread is now mentally open without a grounded next step.',
      delta: 'clear decision window → stale silent thread',
      timeframe: '11 days',
      outcome_class: 'risk',
      why_now: 'The thread is quiet enough that continuing to hold bandwidth open is now more expensive than waiting for a real signal.',
    };
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'brief',
            target_reader: 'user',
            title: 'Execution rule for the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
            content: 'The Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference matters over the next 30-90 days. 1 follow-ups in 14 days without a reply means Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21 is no longer an active thread; it is an open loop consuming attention.\n\nExecution move: stop holding live bandwidth open for Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21 today. Treat it as inactive until a concrete next-step signal arrives, and reallocate that time to the highest-probability work for the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference.',
          },
          evidence: 'The thread is still mentally open.',
          why_now: 'The pattern is visible now.',
          causal_diagnosis: {
            why_exists_now: 'Repeated follow-ups are not producing a real yes/no.',
            mechanism: 'The thread stayed open without a closing move.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).toContain('Waiting on MAS3 (HCA) hiring decision');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectDocumentArtifactShape(embeddedArtifact, {
      minTitleLength: 16,
      minLength: 220,
      minParagraphs: 6,
      requiredTerms: ['Waiting on MAS3 (HCA) hiring decision'],
      forbiddenPatterns: [
        'means Stop holding live bandwidth open for',
        'for Stop holding live bandwidth open for',
      ],
    });
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_repaired',
      generationStatus: 'decision_enforcement_repaired',
    }));
  });

  it('repairs send_message fallback with an explicit ask that passes enforcement', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'commitment';
    scored.winner.suggestedActionType = 'send_message';
    scored.winner.title = 'Commitment due today: confirm launch approval owner';
    scored.winner.content = `Launch approval owner is unresolved and deadline is ${isoDateFromFixedNow(1)}.`;
    scored.winner.relationshipContext = '- Launch Approver <approver@launchco.com> (Approver)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Send a quick note.',
          artifact_type: 'send_message',
          artifact: {
            to: 'approver@launchco.com',
            subject: 'Quick update',
            body: 'Following up on this thread.',
          },
          evidence: 'Owner is unresolved.',
          why_now: 'Need movement.',
          causal_diagnosis: {
            why_exists_now: 'The thread asks for approval but no owner has accepted accountability.',
            mechanism: 'Unowned dependency before deadline.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('send_message');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectEmailArtifactShape(embeddedArtifact, {
      expectedRecipient: 'approver@launchco.com',
      minSubjectLength: 12,
      minBodyLength: 60,
      requireQuestion: true,
      dateAnchors: [isoDateFromFixedNow(1)],
      requiredRegexes: [/confirm|owner|next step/i],
    });
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_repaired',
      generationStatus: 'decision_enforcement_repaired',
    }));
  });

  it('repairs send_message fallback when the model drifts into write_document schema', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'commitment';
    scored.winner.suggestedActionType = 'send_message';
    scored.winner.title = 'Commitment due today: confirm launch approval owner';
    scored.winner.content = `Launch approval owner is unresolved and deadline is ${isoDateFromFixedNow(1)}.`;
    scored.winner.relationshipContext = '- Launch Approver <approver@launchco.com> (Approver)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Write a quick update.',
          artifact_type: 'write_document',
          artifact: {
            title: 'Status update',
            content: 'Need approval owner.',
          },
          evidence: 'Owner is unresolved.',
          why_now: 'Need movement.',
          causal_diagnosis: {
            why_exists_now: 'The thread asks for approval but no owner has accepted accountability.',
            mechanism: 'Unowned dependency before deadline.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('send_message');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectEmailArtifactShape(embeddedArtifact, {
      expectedRecipient: 'approver@launchco.com',
      minSubjectLength: 12,
      minBodyLength: 60,
      requireQuestion: true,
      dateAnchors: [isoDateFromFixedNow(1)],
      requiredRegexes: [/confirm|owner|next step/i],
    });
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_repaired',
      generationStatus: 'decision_enforcement_repaired',
    }));
  });

  it('repairs send_message fallback when the model output is not valid JSON', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'commitment';
    scored.winner.suggestedActionType = 'send_message';
    scored.winner.title = 'Commitment due today: confirm launch approval owner';
    scored.winner.content = `Launch approval owner is unresolved and deadline is ${isoDateFromFixedNow(1)}.`;
    scored.winner.relationshipContext = '- Launch Approver <approver@launchco.com> (Approver)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: 'not valid json',
      }],
    });

    const { generateDirective } = await import('../generator');
    const directivePromise = generateDirective('user-1', { dryRun: true });
    await advanceJsonParseRetryTimers(2);
    const directive = await directivePromise;

    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.action_type).toBe('send_message');
    const embeddedArtifact = (directive as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expectEmailArtifactShape(embeddedArtifact, {
      expectedRecipient: 'approver@launchco.com',
      minSubjectLength: 12,
      minBodyLength: 60,
      requireQuestion: true,
      dateAnchors: [isoDateFromFixedNow(1)],
      requiredRegexes: [/confirm|owner|next step/i],
    });
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_repaired',
      generationStatus: 'decision_enforcement_repaired',
    }));
  });

  it('produces different repaired artifacts when causal diagnosis mechanism changes', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'commitment';
    scored.winner.suggestedActionType = 'write_document';
    scored.winner.title = 'Approval thread drift before legal cutoff';
    scored.winner.content = `Approval keeps moving without owner assignment and cutoff is ${isoDateFromFixedNow(1)}.`;
    scored.winner.relationshipContext = '- Legal Approver (Approver)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Write a quick update.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'summary',
            target_reader: 'team',
            title: 'Status update',
            content: 'This document summarizes the current status for reference.',
          },
          evidence: 'Approval path remains unresolved.',
          why_now: 'Need to keep things moving.',
          causal_diagnosis: {
            why_exists_now: 'The approver requested a decision but no owner accepted dependency ownership.',
            mechanism: 'Unowned dependency before a legal deadline.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const depDirective = await generateDirective('user-1', { dryRun: true });
    const depArtifact = (depDirective as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expect(depDirective.action_type).toBe('write_document');
    expectDocumentArtifactShape(depArtifact, {
      minTitleLength: 12,
      minLength: 100,
      requiredRegexes: [/\bowner\b/i],
    });

    scored.winner.title = 'Relationship cooling after asymmetric effort in partner thread';
    scored.winner.content = 'Two substantive updates were sent, but responses remained non-committal with no direct yes/no answer.';
    scored.winner.relatedSignals = ['Message sent Monday with no direct commitment response by Wednesday.'];

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 120, output_tokens: 90 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Write a quick update.',
          artifact_type: 'write_document',
          artifact: {
            document_purpose: 'summary',
            target_reader: 'team',
            title: 'Status update',
            content: 'This document summarizes the current status for reference.',
          },
          evidence: 'Engagement is cooling and reply asymmetry increased.',
          why_now: 'Need to keep things moving.',
          causal_diagnosis: {
            why_exists_now: 'You sent two substantive updates and got non-committal responses.',
            mechanism: 'Relationship cooling after asymmetric effort.',
          },
        }),
      }],
    });

    const relDirective = await generateDirective('user-1', { dryRun: true });
    const relArtifact = (relDirective as { embeddedArtifact?: Record<string, unknown> }).embeddedArtifact;
    expect(relDirective.action_type).toBe('write_document');

    expect(depArtifact?.content).not.toEqual(relArtifact?.content);
    expectDocumentArtifactShape(relArtifact, {
      minTitleLength: 12,
      minLength: 100,
      requiredRegexes: [/relationship/i],
    });
  });

  it('suppresses a repeated directive shape after two visible copies in 24h', async () => {
    const duplicateDirectiveText = buildPartnerDirectiveText();
    queueTkgActionsResult([
      {
        id: 'dup-shape-1',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: { artifact: { to: 'partner@example.com' } },
        status: 'skipped',
      },
      {
        id: 'dup-shape-2',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: { artifact: { to: 'partner@example.com' } },
        status: 'pending_approval',
      },
    ]);

    const { checkConsecutiveDuplicate } = await import('../generator');
    const duplicate = await checkConsecutiveDuplicate(
      'user-1',
      duplicateDirectiveText,
    );

    expect(duplicate).toEqual(expect.objectContaining({
      isDuplicate: true,
      matchingActionId: 'dup-shape-2',
    }));
  });

  it('keeps a single recent similar directive from blocking the next winner', async () => {
    const duplicateDirectiveText = buildPartnerDirectiveText();
    queueTkgActionsResult([
      {
        id: 'dup-shape-1',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: { artifact: { to: 'partner@example.com' } },
        status: 'skipped',
      },
    ]);

    const { checkConsecutiveDuplicate } = await import('../generator');
    const duplicate = await checkConsecutiveDuplicate(
      'user-1',
      duplicateDirectiveText,
    );

    expect(duplicate.isDuplicate).toBe(false);
  });

  it('ignores dev force-fresh auto-suppressed ghost rows when checking live duplicate suppression', async () => {
    const duplicateDirectiveText = buildPartnerDirectiveText();
    queueTkgActionsResult([
      {
        id: 'force-fresh-ghost-1',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: {
          artifact: { to: 'partner@example.com' },
          auto_suppression_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
        },
        status: 'skipped',
      },
      {
        id: 'force-fresh-ghost-2',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: {
          artifact: { to: 'partner@example.com' },
          auto_suppression_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
        },
        status: 'skipped',
      },
    ]);

    const { checkConsecutiveDuplicate } = await import('../generator');
    const duplicate = await checkConsecutiveDuplicate(
      'user-1',
      duplicateDirectiveText,
    );

    expect(duplicate.isDuplicate).toBe(false);
  });

  it('still blocks real user-visible prior directives after ghost rows are excluded', async () => {
    const duplicateDirectiveText = buildPartnerDirectiveText();
    queueTkgActionsResult([
      {
        id: 'force-fresh-ghost-1',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: {
          artifact: { to: 'partner@example.com' },
          auto_suppression_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
        },
        status: 'skipped',
      },
      {
        id: 'real-visible-1',
        directive_text: duplicateDirectiveText,
        action_type: 'send_message',
        execution_result: { artifact: { to: 'partner@example.com' } },
        status: 'approved',
      },
    ]);

    const { checkConsecutiveDuplicate } = await import('../generator');
    const duplicate = await checkConsecutiveDuplicate(
      'user-1',
      duplicateDirectiveText,
    );

    expect(duplicate).toEqual(expect.objectContaining({
      isDuplicate: true,
      matchingActionId: 'real-visible-1',
    }));
  });

  it('ignores verification-stub persistence when checking live duplicate suppression', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.type = 'commitment';
    scored.winner.suggestedActionType = 'write_document';
    scored.winner.title = "Commitment due in 0d: Webinar 'Algoritmo Zero' launch decision";
    scored.winner.content = `Webinar launch ownership is unresolved and cutoff is ${isoDateFromFixedNow(1)}.`;
    scored.winner.relationshipContext = '- Webinar Owner <owner@algoritmozero.com> (Partner)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    const { generateDirective } = await import('../generator');
    const freshDirective = await generateDirective('user-1', {
      dryRun: true,
      pipelineDryRun: true,
      verificationStubPersist: true,
      verificationGoldenPathWriteDocument: true,
    });

    expect(freshDirective.action_type).toBe('write_document');
    expectDirectiveShape(freshDirective.directive, {
      minLength: 40,
      requiredTerms: ["Webinar 'Algoritmo Zero' launch decision", 'owner@algoritmozero.com'],
      dateAnchors: ['2026-04-21'],
    });

    vi.clearAllMocks();
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([
      {
        id: 'doc-dup-1',
        directive_text: freshDirective.directive,
        action_type: 'write_document',
        execution_result: {
          artifact: { title: 'Resolution note — April 2026 calendar overlap' },
          verification_stub_persist: true,
        },
        status: 'skipped',
      },
      {
        id: 'doc-dup-2',
        directive_text: freshDirective.directive,
        action_type: 'write_document',
        execution_result: {
          artifact: { title: 'Resolution note — April 2026 calendar overlap' },
          verification_stub_persist: true,
        },
        status: 'rejected',
      },
    ]);

    const blockedDirective = await generateDirective('user-1', {
      dryRun: true,
      pipelineDryRun: true,
      verificationStubPersist: true,
      verificationGoldenPathWriteDocument: true,
    });

    expect(blockedDirective.action_type).toBe('write_document');
    expect(blockedDirective.directive).toBe(freshDirective.directive);
    expect(mockLogStructuredEvent.mock.calls.some(([event]) =>
      event?.event === 'candidate_blocked' && event?.generationStatus === 'duplicate_suppressed')).toBe(false);
  });

  it('blocks send_message via DecisionPayload when winner entity matches locked_contact (scorer should pre-filter; generator still guards)', async () => {
    // AB-25: normalized_entity stored with spaces ("nicole vreeland") must still match
    // entityName "Nicole Vreeland" after both sides strip whitespace.
    // scoreOpenLoops normally drops locked entities before generation; if a mocked winner still
    // carries the locked entity, buildDecisionPayload adds locked_contact_suppression before LLM.
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.entityName = 'Nicole Vreeland';
    scored.winner.suggestedActionType = 'send_message';
    scored.winner.title = 'Follow up with Nicole about the reference letter';
    scored.winner.content = 'Nicole has not responded to the reference letter request.';
    scored.winner.relationshipContext = '- Nicole Vreeland <nicole.vreeland@example.com> (Contact)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    // Return a locked_contact row with spaces in normalized_entity (the real DB format).
    queueLockedConstraints([{ normalized_entity: 'nicole vreeland' }]);

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', {
      dryRun: true,
      pipelineDryRun: true,
    });

    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(signalSelectCalls).toEqual([]);
    expect(mockDecryptWithStatus).not.toHaveBeenCalled();
    expect(directive.directive).toBe('__GENERATION_FAILED__');
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_blocked',
      generationStatus: 'decision_payload_blocked',
      details: expect.objectContaining({
        payload_errors: expect.arrayContaining(['locked_contact_suppression']),
      }),
    }));
  });

  it('does not block a send_message candidate whose entity name is not in the locked_contact list', async () => {
    const scored = asWinnerScored(buildScorerResult());
    scored.winner.entityName = 'Jane Smith';
    scored.winner.title = 'Follow up with Jane about the proposal';
    scored.winner.content = 'Jane has not responded to the proposal.';
    scored.winner.relationshipContext = '- Jane Smith <jane@example.com> (Contact)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    // Lock a different contact — Jane must not be blocked.
    queueLockedConstraints([{ normalized_entity: 'nicole vreeland' }]);

    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);
    queueTkgActionsResult([]);

    anthropicCreate.mockResolvedValue({
      usage: { input_tokens: 100, output_tokens: 80 },
      content: [{
        type: 'text',
        text: JSON.stringify({
          directive: 'Request Jane\'s yes/no on the proposal by end of day Friday.',
          artifact_type: 'send_message',
          artifact: {
            to: 'jane@example.com',
            subject: 'Proposal decision needed by Friday EOD',
            body: 'Hi Jane,\n\nCan you confirm by end of day Friday whether you\'d like to proceed with the proposal? If we miss this window, the pricing expires and we\'ll need to restart the evaluation.\n\nThanks,\nBrandon',
          },
          evidence: 'Jane has not replied and the proposal pricing expires Friday.',
          why_now: 'Pricing expires end of day Friday — no response means restart from scratch.',
          causal_diagnosis: {
            why_exists_now: 'Jane still has not given a yes/no decision and the proposal pricing expires Friday.',
            mechanism: 'Pending external decision before a pricing deadline.',
          },
        }),
      }],
    });

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    // Jane is NOT locked — the LLM should have been called and produced a real directive.
    expect(anthropicCreate).toHaveBeenCalled();
    expect(directive.reason).not.toContain('locked_contact_suppression');
    expect(mockLogStructuredEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      event: 'candidate_blocked',
      details: expect.objectContaining({ reason: 'locked_contact', entity_name: 'Jane Smith' }),
    }));
  });

});
