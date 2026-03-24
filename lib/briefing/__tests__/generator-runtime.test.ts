import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScoredLoop, ScorerResult } from '../scorer';

const mockScoreOpenLoops = vi.fn<() => Promise<ScorerResult | null>>();
const mockIsOverDailyLimit = vi.fn<() => Promise<boolean>>();
const mockTrackApiCall = vi.fn<() => Promise<void>>();
const mockResearchWinner = vi.fn<() => Promise<null>>();
const mockGetDirectiveConstraintViolations = vi.fn();
const mockGetPinnedConstraintPrompt = vi.fn();
const mockLogStructuredEvent = vi.fn();

const queryResult = { data: [], error: null };
const tkgActionsResultsQueue: Array<{ data: unknown[]; error: null }> = [];

function makeLimitQuery(table: string, result = queryResult) {
  return {
    eq() { return this; },
    neq() { return this; },
    in() { return this; },
    gte() { return this; },
    not() { return this; },
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
        in() { return Promise.resolve(queryResult); },
        eq() { return this; },
        gte() { return this; },
        order() { return this; },
        limit() { return Promise.resolve(queryResult); },
      };
    },
  };
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'tkg_actions' || table === 'tkg_goals') {
        return {
          select() {
            return makeLimitQuery(table);
          },
        };
      }

      if (table === 'tkg_signals') {
        return makeSignalsQuery();
      }

      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/briefing/scorer', () => ({
  scoreOpenLoops: mockScoreOpenLoops,
}));

vi.mock('@/lib/utils/api-tracker', () => ({
  isOverDailyLimit: mockIsOverDailyLimit,
  trackApiCall: mockTrackApiCall,
}));

vi.mock('@/lib/briefing/researcher', () => ({
  researchWinner: mockResearchWinner,
}));

vi.mock('@/lib/briefing/pinned-constraints', () => ({
  getDirectiveConstraintViolations: mockGetDirectiveConstraintViolations,
  getPinnedConstraintPrompt: mockGetPinnedConstraintPrompt,
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: mockLogStructuredEvent,
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
    relationshipContext: '- MAS3 Hiring Manager <manager@example.com> (Hiring)',
  };
}

function buildScorerResult(): ScorerResult {
  return {
    winner: buildWinner(),
    deprioritized: [],
    candidateDiscovery: {
      candidateCount: 3,
      suppressedCandidateCount: 0,
      selectionMargin: 0.8,
      selectionReason: 'Selected because score 4.8 beat the next-best candidate.',
      failureReason: null,
      topCandidates: [],
    },
  };
}

describe('generateDirective runtime failures', () => {
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
  });

  function queueTkgActionsResult(data: unknown[]): void {
    tkgActionsResultsQueue.push({ data, error: null });
  }

  it('falls back at generation stage when the LLM request throws', async () => {
    mockScoreOpenLoops.mockResolvedValue(buildScorerResult());
    anthropicCreate.mockRejectedValue(
      new Error('400 {"type":"error","error":{"message":"credit balance too low"}}'),
    );

    const { generateDirective } = await import('../generator');
    const directive = await generateDirective('user-1', { dryRun: true });

    expect(directive.directive).not.toBe('__GENERATION_FAILED__');
    expect(directive.generationLog?.stage).toBe('generation');
    expect(directive.generationLog?.reason).toContain('credit balance too low');
  });

  it('skips research below the winner-score threshold and logs the triggering score', async () => {
    const scored = buildScorerResult();
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
            to: 'manager@example.com',
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

    expect(mockResearchWinner).not.toHaveBeenCalled();
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'researcher_skipped_low_score',
      generationStatus: 'researcher_skipped',
      details: expect.objectContaining({
        winner_score: 1.9,
        threshold: 2.0,
      }),
    }));
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
    "to": "manager@example.com",
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
      max_tokens: 3200,
      system: expect.stringContaining('CRITICAL: Return ONLY a JSON object.'),
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
    const scored = buildScorerResult();
    scored.winner.title = 'Email Yadira about the project timeline update';
    scored.winner.content = 'Yadira asked for a timeline update and still needs the status summary.';
    scored.winner.relationshipContext = '- Yadira Clapper <yadira@example.com> (Client)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    // loadRecentActionGuardrails() queries
    queueTkgActionsResult([]);
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
    expect(directive.reason).toContain('already exists in the last 7 days');
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(mockLogStructuredEvent).toHaveBeenCalledWith(expect.objectContaining({
      generationStatus: 'recent_entity_action_suppressed',
      details: expect.objectContaining({
        entity_name: expect.stringContaining('Yadira'),
      }),
    }));
  });

  it('suppresses schedule candidates when the same contact was actioned in the last 7 days', async () => {
    const scored = buildScorerResult();
    scored.winner.suggestedActionType = 'schedule';
    scored.winner.title = 'Schedule a focused block with Yadira before Friday';
    scored.winner.content = 'Yadira has not replied and the Friday deadline is near.';
    scored.winner.relationshipContext = '- Yadira Clapper <yadira@example.com> (Client)';
    mockScoreOpenLoops.mockResolvedValue(scored);

    queueTkgActionsResult([]);
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
    expect(directive.reason).toContain('already exists in the last 7 days');
    expect(anthropicCreate).not.toHaveBeenCalled();
  });
});
