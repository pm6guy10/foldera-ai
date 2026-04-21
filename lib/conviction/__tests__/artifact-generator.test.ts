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
import {
  expectDocumentArtifactShape,
  expectEmailArtifactShape,
} from '@/test/generated-output-assertions';

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

  it('suppresses generic write_document output when LLM returns a raw analysis dump and no finished fallback exists', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const result = await generateArtifact('user-1', { ...BASE_WRITE_DOCUMENT_DIRECTIVE });

    expect(result).toBeNull();
  });

  it('accepts a clean finished write_document artifact', async () => {
    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      fullContext: 'Action Plan\n\n1. Draft the final proposal package.\n2. Send it by 4pm with explicit approval ask.',
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    expect((result as any).type).toBe('document');
    const { title, content } = expectDocumentArtifactShape(result, {
      minTitleLength: 20,
      minLength: 60,
      minParagraphs: 2,
    });
    expect(title).toContain('financial runway concern');
    expect(content).toBe(directive.fullContext);
  });

  it('suppresses hostile meta commentary when no finished document fallback exists', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(HOSTILE_META_DUMP));

    const result = await generateArtifact('user-1', { ...BASE_WRITE_DOCUMENT_DIRECTIVE });

    expect(result).toBeNull();
  });

  it('builds a finished decision memo fallback instead of generic execution notes when the directive is decision-shaped', async () => {
    mockCreate.mockResolvedValue(anthropicResponse(ANALYSIS_DUMP));

    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      directive: 'Lock the final approval owner for the runway packet by 2026-04-21.',
      reason: 'If the owner is still missing after 2026-04-21, the runway packet slips.',
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).not.toBeNull();
    const content = expectDocumentArtifactShape(result, {
      minTitleLength: 20,
      minLength: 140,
      minParagraphs: 4,
      dateAnchors: ['2026-04-21'],
      requiredRegexes: [/decision required:/i, /\bmove:/i, /\bowner:/i, /\bconsequence:/i],
      forbiddenPatterns: ['Objective:', 'Execution Notes:'],
    }).content;
    expect(content).toContain('2026-04-21');
  });

  it('repairs weak send_message output into a grounded ask with timing and consequence', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          type: 'email',
          to: 'approver@example.com',
          subject: 'Quick update',
          body: 'Following up on this.',
        }),
      }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const result = await generateArtifact('user-1', {
      action_type: 'send_message',
      directive: 'Confirm the final approval owner for the launch packet by 2026-04-21.',
      reason: 'If no owner is named by 2026-04-21, the packet slips.',
      evidence: [{ type: 'signal', description: 'approver@example.com asked who owns final packet delivery.' }],
      requires_search: false,
    } as any);

    expect(result).not.toBeNull();
    const { body } = expectEmailArtifactShape(result, {
      expectedRecipient: 'approver@example.com',
      minSubjectLength: 20,
      minBodyLength: 80,
      requireQuestion: true,
      dateAnchors: ['2026-04-21'],
      requiredRegexes: [/confirm/i],
    });
    expect(body).toMatch(/owner|next step/i);
    expect(body).toMatch(/blocked|slips|cutoff/i);
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
    const { title, content } = expectDocumentArtifactShape(result, {
      minTitleLength: 20,
      minLength: 250,
      minParagraphs: 6,
      requiredTerms: ['pilot decision', 'Pat Lee', 'today'],
      requiredRegexes: [
        /Execution move:/i,
        /Why this beats the alternatives:/i,
        /Deprioritize:/i,
        /Reopen trigger:/i,
        /Deadline:/i,
      ],
      forbiddenPatterns: [
        '## Pattern observed',
        '## Why it matters now',
        '## Concrete decision / next move',
        '## Owner / deadline',
        'Send one direct follow-up',
        'should I close this out',
        'keep clogging your inbox',
      ],
    });
    expect(title).toContain('pilot decision');
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
    const { title, content } = expectDocumentArtifactShape(result, {
      minTitleLength: 16,
      minLength: 220,
      minParagraphs: 6,
      requiredTerms: ['Pat Lee', 'today'],
      requiredRegexes: [
        /Execution move:/i,
        /Why this beats the alternatives:/i,
        /Deprioritize:/i,
        /Consequence:/i,
        /Reopen trigger:/i,
        /Deadline:/i,
      ],
      forbiddenPatterns: [
        'pilot decision',
        'You were trying to get this thread to a real yes/no',
        '## Pattern observed',
        '## Why it matters now',
        '## Concrete decision / next move',
        '## Owner / deadline',
        'Send one direct follow-up',
      ],
    });
    expect(title).toContain('Pat Lee');
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
    expectDocumentArtifactShape(result, {
      minTitleLength: 16,
      minLength: 220,
      minParagraphs: 6,
      requiredTerms: ['Pat Lee'],
      requiredRegexes: [
        /Execution move:/i,
        /Why this beats the alternatives:/i,
        /Deprioritize:/i,
        /Reopen trigger:/i,
      ],
      forbiddenPatterns: [
        'Weak analysis blob that would be sludge if returned verbatim.',
        'This should not be copied through.',
        'Send this today:',
      ],
    });
  });

  it('preserves the clean embedded behavioral_pattern write_document artifact instead of regenerating from the directive sentence', async () => {
    const directive: any = {
      ...BASE_WRITE_DOCUMENT_DIRECTIVE,
      discrepancyClass: 'behavioral_pattern',
      directive: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21.',
      reason: 'The MAS3 thread is no longer moving and is stealing bandwidth from the higher-leverage career path.',
      embeddedArtifact: {
        type: 'document',
        title: 'Execution rule for the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
        content: [
          'The Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference matters over the next 30-90 days. 1 follow-ups in 14 days without movement means Waiting on MAS3 (HCA) hiring decision is no longer an active thread; it is an open loop consuming attention.',
          '',
          'Execution move: stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision today. Treat it as inactive until a concrete next-step signal arrives, and reallocate that time to the highest-probability work for the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference.',
          '',
          'Why this beats the alternatives: 1 follow-ups in 14 days without a reply means another generic nudge is more likely to preserve ambiguity than improve the odds on the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference, while reclaiming the time changes the next 30-90 days of real leverage.',
          '',
          'Deprioritize: do not draft another status-check message, do not keep calendar or prep time reserved for Waiting on MAS3 (HCA) hiring decision, and do not treat the thread as an active commitment while silence continues.',
          '',
          'Consequence: if this stays mentally open past 5:00 PM PT on 2026-04-21, the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference keeps losing real bandwidth to a thread that is not moving.',
          '',
          'Reopen trigger: only reopen if a concrete next step, decision, or scheduling signal arrives by 5:00 PM PT on 2026-04-21.',
          '',
          'Deadline: 5:00 PM PT on 2026-04-21',
        ].join('\n'),
      },
    };

    const result = await generateArtifact('user-1', directive);

    expect(result).toEqual(directive.embeddedArtifact);
    const content = String((result as any)?.content ?? '');
    expect(content).not.toContain('means Stop holding live bandwidth open for');
    expect(content).not.toContain('for Stop holding live bandwidth open for');
  });

  it('schedule_conflict discrepancy marks write_document output as invalid on this path', async () => {
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
    expect(firstCall?.system ?? '').toMatch(/CALENDAR CONFLICTS ARE NOT VALID WRITE_DOCUMENT OUTPUTS ON THIS PATH/i);
    expect(firstCall?.system ?? '').not.toMatch(/Numbered steps, each completable/i);
  });

  it('renders a single interview-week execution brief from clustered signals and exclusion notes', async () => {
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
    const { title, content } = expectDocumentArtifactShape(result, {
      minTitleLength: 24,
      minLength: 500,
      minParagraphs: 9,
      requiredTerms: [
        'SHPC4 Interview - Social and Health Program Consultant 4 - DSHS',
        'MEDS/MAS3 Interview - Administrative Specialist 3 - HCA',
        'Training & Appeals Program Manager Interview - WA Cares',
        'Program operations',
        'Appeals coordination',
        'Dance',
        'Put Trash Can Out',
        'Bible study at Brightside',
        'soccer game',
        'baby shower',
      ],
      requiredRegexes: [
        /^EXECUTION MOVE/m,
        /^ACTUAL INTERVIEW SCHEDULE/m,
        /^CROSS-ROLE STORY REUSE/m,
        /^ROLE-SPECIFIC ANGLES/m,
        /^COMPLETED MATERIALS \/ FORMS ALREADY EVIDENCED/m,
        /^MISSING PREP MOVES/m,
        /^QUESTIONS TO ASK/m,
        /^REOPEN TRIGGER/m,
        /^WHAT TO IGNORE/m,
      ],
      forbiddenPatterns: [
        'MASTER SCHEDULE',
        'PRIORITY ORDER',
        'CORE STORIES TO REUSE',
        'DAY-BY-DAY PREP FOCUS',
        'RED FLAGS / LOAD MANAGEMENT',
        'EXCLUDED PERSONAL EVENTS',
        'research the company',
        'prepare examples',
      ],
    });
    expect(title).toMatch(/^Interview Week Execution Brief/);
    expect(content).toMatch(/Tue, Apr 21|Wed, Apr 22|Thu, Apr 23/);
  });
});
