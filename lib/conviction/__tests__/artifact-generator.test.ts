/**
 * Regression tests for analysis dump leak prevention in artifact-generator.
 *
 * Proof case: tkg_actions row f756c56f — type=document, content started with
 * "INSIGHT: Financial runway..." — raw scoring metadata surfaced to user.
 *
 * Two defenses under test:
 *   Fix 1 — generateArtifact catch block: analysis dumps in embeddedArtifact.context
 *            are no longer shortcut-converted to raw document content.
 *   Fix 2 — validateArtifact write_document: hard-rejects any document content
 *            that matches isAnalysisDump() (defense-in-depth).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateArtifact } from '../artifact-generator';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

vi.mock('@/lib/db/client', () => {
  // Chainable query builder — every method returns itself so any query
  // chain terminates cleanly without needing per-path stubs.
  const ch: any = {};
  ['select', 'eq', 'neq', 'gte', 'order'].forEach((m) => {
    ch[m] = () => ch;
  });
  ch.limit = () => Promise.resolve({ data: [], error: null });
  ch.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return { createServerClient: () => ({ from: () => ch }) };
});

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/encryption', () => ({
  decryptWithStatus: vi.fn((v: string) => ({ plaintext: v, usedFallback: false })),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Exact format that leaks from buildFullContext() in generator.ts */
const ANALYSIS_DUMP =
  'INSIGHT: test\n\nWHY NOW: test\n\nWinning loop: test\n\nRunner-ups rejected:\n- test';
const HOSTILE_META_DUMP =
  'Insight - drift\nWhy now - timing\nThis candidate won because score: 4.7\nRunner ups rejected because low tractability\nClient asked for revised budget by Friday.';

function anthropicResponse(content: string) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ type: 'document', title: 'Test Title', content }),
      },
    ],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const BASE_WRITE_DOCUMENT_DIRECTIVE: any = {
  action_type: 'write_document',
  directive: 'Address financial runway concern',
  reason: '',
  evidence: [],
  requires_search: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('artifact-generator — analysis dump leak prevention', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('does not surface raw analysis dump when embeddedArtifact.context is an analysis dump (Fix 1)', async () => {
    // Before the fix: the catch-block shortcut would have returned the analysis dump
    // verbatim as document content. After the fix: isAnalysisDump() is false in the
    // condition, so the shortcut is skipped and the generator falls through to LLM
    // generation, which returns clean content.
    mockCreate.mockResolvedValue(
      anthropicResponse('This is clean and actionable content.'),
    );

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      embeddedArtifact: {
        type: 'wait_rationale',
        context: ANALYSIS_DUMP,
      },
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const content = (result as any)?.content ?? '';
    expect(content).not.toMatch(/Runner-ups rejected:/);
    expect(content).not.toMatch(/Winning loop:/);
    expect(content).not.toMatch(/^INSIGHT:/m);
    expect(content).not.toMatch(/^WHY NOW:/m);
  });

  it('uses emergency write_document when LLM returns a raw analysis dump (validateArtifact rejects; generator still returns artifact)', async () => {
    // validateArtifact hard-rejects analysis-shaped document content; generateArtifact
    // must still return an emergency_fallback document so the brief pipeline does not stop at null.
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const result = await generateArtifact('user-1', { ...BASE_WRITE_DOCUMENT_DIRECTIVE });

    expect(result).not.toBeNull();
    expect((result as any).type).toBe('document');
    expect((result as any).emergency_fallback).toBe(true);
    // Emergency uses directive.fullContext when set; fixture has none — falls back to directive text.
    expect((result as any).content).toBe('Address financial runway concern');
  });

  it('accepts a clean finished write_document artifact', async () => {
    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      fullContext: 'Action Plan\n\n1. Draft the final proposal package.\n2. Send it by 4pm with explicit approval ask.',
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).toEqual({
      type: 'document',
      title: 'Address financial runway concern',
      content: 'Action Plan\n\n1. Draft the final proposal package.\n2. Send it by 4pm with explicit approval ask.',
    });
  });

  it('falls back to emergency document when LLM returns hostile meta commentary as content', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(HOSTILE_META_DUMP));

    const result = await generateArtifact('user-1', { ...BASE_WRITE_DOCUMENT_DIRECTIVE });

    expect(result).not.toBeNull();
    expect((result as any).emergency_fallback).toBe(true);
    expect((result as any).content.length).toBeGreaterThan(20);
  });

  it('fallback repair path returns finished document text, not analysis scaffolding', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      fullContext: HOSTILE_META_DUMP,
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const content = (result as any).content as string;
    expect(content).not.toMatch(/insight/i);
    expect(content).not.toMatch(/why now/i);
    expect(content).not.toMatch(/runner[\s-]?ups?/i);
    expect(content).not.toMatch(/rejected because/i);
    expect(content).not.toMatch(/this candidate/i);
  });

  it('renders behavioral_pattern write_document with a grounded goal when one is available', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      discrepancyClass: 'behavioral_pattern',
      directive: '3 inbound messages to Pat Lee in 14 days, 0 replies.',
      reason: 'The same reply gap has repeated long enough to be a pattern.',
      fullContext: ANALYSIS_DUMP,
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'Matched goal metadata is grounded in the current thread.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'Goal metadata and active goals agree.',
          failureReason: null,
          topCandidates: [
            {
              id: 'candidate-1',
              rank: 1,
              candidateType: 'discrepancy',
              actionType: 'write_document',
              score: 9.2,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.85,
                tractability: 0.8,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'pilot decision',
                priority: 4,
                category: 'work',
              },
              sourceSignals: [{ kind: 'signal', summary: 'Pat Lee thread' }],
              decision: 'selected',
              decisionReason: 'The pilot decision is the strongest grounded goal in the current context.',
            },
          ],
        },
        brief_context_debug: {
          active_goals: ['pilot decision'],
        },
      },
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const title = String((result as any).title ?? '');
    const content = String((result as any).content ?? '');

    expect(title).toBe('Pat Lee going dark is now blocking the pilot decision');
    expect(content).toBe(
      [
        'You were trying to get this thread to a real yes/no on the pilot decision. 3 follow-ups in 14 days without a reply means it is no longer active, just mentally open.',
        '',
        'Send this today:',
        '',
        '“Hey Pat — I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted. Is this something you still want to pursue, or should I close the loop on my side?”',
        '',
        'If there is no reply after this, mark the thread stalled and stop allocating attention to it.',
        '',
        'Deadline: today',
      ].join('\n'),
    );
    expect(content).toContain('You were trying to get this thread to a real yes/no on the pilot decision.');
    expect(content).toContain('3 follow-ups in 14 days without a reply');
    expect(content).toContain('If there is no reply after this, mark the thread stalled and stop allocating attention to it.');
    expect(content).toContain('“Hey Pat — I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted. Is this something you still want to pursue, or should I close the loop on my side?”');
    expect(content).not.toContain('## Pattern observed');
    expect(content).not.toContain('## Why it matters now');
    expect(content).not.toContain('## Concrete decision / next move');
    expect(content).not.toContain('## Owner / deadline');
    expect(content).not.toContain('Send one direct follow-up');
    expect(content).not.toContain('should I close this out');
    expect(content).not.toContain('keep clogging your inbox');
  });

  it('falls back to a non-goal behavioral_pattern note when grounded goal evidence is weak', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      discrepancyClass: 'behavioral_pattern',
      directive: '3 inbound messages to Pat Lee in 14 days, 0 replies.',
      reason: 'The same reply gap has repeated long enough to be a pattern.',
      fullContext: ANALYSIS_DUMP,
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'No grounded goal evidence is available.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'No target goal metadata was present.',
          failureReason: null,
          topCandidates: [
            {
              id: 'candidate-2',
              rank: 1,
              candidateType: 'discrepancy',
              actionType: 'write_document',
              score: 8.1,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.85,
                tractability: 0.8,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: null,
              sourceSignals: [{ kind: 'signal', summary: 'Pat Lee thread' }],
              decision: 'selected',
              decisionReason: 'The obstruction is grounded, but no goal context is strong enough to name.',
            },
          ],
        },
      },
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const title = String((result as any).title ?? '');
    const content = String((result as any).content ?? '');

    expect(title).toBe('Pat Lee going dark is now blocking the thread');
    expect(content).toContain('3 follow-ups in 14 days without a reply means this thread is stalled, not active.');
    expect(content).toContain('If there is no reply after this, mark the thread stalled and stop allocating attention to it.');
    expect(content).toContain('“Hey Pat — I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted. Is this something you still want to pursue, or should I close the loop on my side?”');
    expect(content).not.toContain('pilot decision');
    expect(content).not.toContain('You were trying to get this thread to a real yes/no');
    expect(content).not.toContain('## Pattern observed');
    expect(content).not.toContain('## Why it matters now');
    expect(content).not.toContain('## Concrete decision / next move');
    expect(content).not.toContain('## Owner / deadline');
    expect(content).not.toContain('Send one direct follow-up');
  });

  it('routes behavioral_pattern wait_rationale context through the finished-note fallback instead of raw passthrough', async () => {
    mockCreate.mockResolvedValue(anthropicResponse('This should not be copied through.'));

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      discrepancyClass: 'behavioral_pattern',
      directive: '4 unresolved follow-ups to Pat Lee in 10 days, 0 replies.',
      reason: '',
      embeddedArtifact: {
        type: 'wait_rationale',
        context: 'Weak analysis blob that would be sludge if returned verbatim.',
      },
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    expect((result as any).emergency_fallback).not.toBe(true);
    const content = String((result as any).content ?? '');
    expect(content).toContain('4 follow-ups in 10 days without a reply means this thread is stalled, not active.');
    expect(content).toContain('Send this today:');
    expect(content).toContain('mark the thread stalled and stop allocating attention to it');
    expect(content).toContain('I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted.');
    expect(content).not.toContain('Weak analysis blob that would be sludge if returned verbatim.');
    expect(content).not.toContain('This should not be copied through.');
    expect(content).not.toContain('You were trying to get this thread to a real yes/no');
  });

  it('schedule_conflict discrepancy uses deadline transform, not person outreach, even if reason mentions reconnect', async () => {
    mockCreate.mockResolvedValue(
      anthropicResponse(
        '1. Decide which event keeps the 2026-04-02 slot.\n2. Decline or reschedule the other in your calendar app.\n3. Text anyone affected before end of day.',
      ),
    );

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      discrepancyClass: 'schedule_conflict',
      directive: 'Resolve overlapping calendar events on 2026-04-02',
      reason: 'Parents visiting creates a natural opportunity to reconnect',
      fullContext: ANALYSIS_DUMP,
    };

    await generateArtifact('user-1', directive);

    expect(mockCreate).toHaveBeenCalled();
    const firstCall = mockCreate.mock.calls[0]?.[0] as { system?: string };
    expect(firstCall?.system ?? '').toMatch(/CALENDAR CONFLICT RESOLUTION NOTE|## Situation/i);
    expect(firstCall?.system ?? '').not.toMatch(/Numbered steps, each completable/i);
  });

  it('renders a single interview-week prep pack from clustered signals and exclusion notes', async () => {
    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      discrepancyClass: 'behavioral_pattern',
      directive: 'Lock one integrated interview prep pack for the confirmed week.',
      reason: 'Several interview signals now share one Pacific-time workweek.',
      fullContext: [
        'INSIGHT: next week is interview-heavy.',
        'Winning loop: Interview week cluster detected: 3 interviews scheduled 2026-04-20 to 2026-04-23',
        'INTERVIEW_WEEK_CLUSTER',
        'WINDOW_PT: 2026-04-20 || 2026-04-23',
        'INTERVIEW_COUNT: 3',
        'INTERVIEW_ITEM: 2026-04-20T16:00:00.000Z || 2026-04-20T17:00:00.000Z || SHPC4 Interview - Social and Health Program Consultant 4 - DSHS || Social and Health Program Consultant 4 || DSHS || program operations; stakeholder coordination; policy interpretation || Cheryl Anderson',
        'INTERVIEW_ITEM: 2026-04-22T18:30:00.000Z || 2026-04-22T19:30:00.000Z || MEDS/MAS3 Interview - Administrative Specialist 3 - HCA || Administrative Specialist 3 || HCA || appeals coordination; training handoffs; policy interpretation || Yadira Clapper',
        'INTERVIEW_ITEM: 2026-04-23T17:00:00.000Z || 2026-04-23T18:00:00.000Z || Training & Appeals Program Manager Interview - WA Cares || Training and Appeals Program Manager || WA Cares || training handoffs; stakeholder coordination; program operations || Keri Nopens',
        'EXCLUDED_ITEM: 2026-04-21T04:15:00.000Z || Dance || non-interview personal event',
        'EXCLUDED_ITEM: 2026-04-22T02:00:00.000Z || Put Trash Can Out || non-interview personal event',
        'EXCLUDED_ITEM: 2026-04-23T02:00:00.000Z || Bible study at Brightside || non-interview personal event',
        'EXCLUDED_ITEM: 2026-04-23T23:00:00.000Z || soccer game || non-interview personal event',
        'EXCLUDED_ITEM: 2026-04-24T01:00:00.000Z || baby shower || non-interview personal event',
      ].join('\n'),
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    expect((result as any).title).toBe('Interview Week Prep Pack — April 20–23, 2026');
    const content = String((result as any).content ?? '');
    expect(content).toContain('MASTER SCHEDULE');
    expect(content).toContain('PRIORITY ORDER');
    expect(content).toContain('CORE STORIES TO REUSE');
    expect(content).toContain('ROLE-SPECIFIC ANGLES');
    expect(content).toContain('QUESTIONS TO ASK');
    expect(content).toContain('DAY-BY-DAY PREP FOCUS');
    expect(content).toContain('RED FLAGS / LOAD MANAGEMENT');
    expect(content).toContain('EXCLUDED PERSONAL EVENTS');
    expect(content).toContain('SHPC4 Interview - Social and Health Program Consultant 4 - DSHS');
    expect(content).toContain('MEDS/MAS3 Interview - Administrative Specialist 3 - HCA');
    expect(content).toContain('Training & Appeals Program Manager Interview - WA Cares');
    expect(content).toContain('Program operations');
    expect(content).toContain('Appeals coordination');
    expect(content).toContain('Tue, Apr 21');
    expect(content).toContain('Wed, Apr 22');
    expect(content).toContain('Thu, Apr 23');
    expect(content).toContain('Dance');
    expect(content).toContain('Put Trash Can Out');
    expect(content).toContain('Bible study at Brightside');
    expect(content).toContain('soccer game');
    expect(content).toContain('baby shower');
    expect(content).not.toContain('research the company');
    expect(content).not.toContain('prepare examples');
  });
});
