import { describe, expect, it } from 'vitest';
import { evaluateBottomGate, isSendWorthy } from '@/lib/cron/daily-brief-generate';
import { validateDirectiveForPersistence, getDecisionEnforcementIssues } from '@/lib/briefing/generator';
import { getArtifactPersistenceIssues } from '@/lib/conviction/artifact-generator';
import type { ConvictionArtifact, ConvictionDirective } from '@/lib/briefing/types';

function discoveryWithScheduleConflictClass() {
  return {
    candidateCount: 3,
    suppressedCandidateCount: 0,
    selectionMargin: 0.1,
    selectionReason: null,
    failureReason: null,
    topCandidates: [
      {
        id: 'discrepancy_conflict_a_b',
        rank: 1,
        candidateType: 'discrepancy' as const,
        discrepancyClass: 'schedule_conflict' as const,
        actionType: 'write_document' as const,
        score: 2,
        scoreBreakdown: {
          stakes: 2,
          urgency: 0.5,
          tractability: 0.7,
          freshness: 1,
          actionTypeRate: 0.5,
          entityPenalty: 0,
        },
        targetGoal: null,
        sourceSignals: [],
        decision: 'selected' as const,
        decisionReason: '',
      },
    ],
  };
}

function baseDirective(overrides: Partial<ConvictionDirective> = {}): ConvictionDirective {
  return {
    directive: 'Overlapping events on 2026-04-02.',
    action_type: 'write_document',
    confidence: 80,
    reason: 'Two calendar blocks overlap on 2026-04-02.',
    evidence: [{ type: 'signal', description: 'Calendar overlap' }],
    discrepancyClass: 'schedule_conflict',
    generationLog: {
      outcome: 'selected',
      stage: 'persistence',
      reason: 'ok',
      candidateFailureReasons: [],
      candidateDiscovery: discoveryWithScheduleConflictClass(),
    },
    ...overrides,
  };
}

describe('schedule_conflict finished-work gates (aligned)', () => {
  const checklistArtifact = {
    type: 'document',
    title: 'Resolve overlap',
    content:
      '1. Open your calendar for 2026-04-02.\n2. Decide which event to move.\n3. Notify attendees.',
  } as unknown as ConvictionArtifact;

  it('rejects owner checklist consistently across bottom gate, send-worthiness, persistence, and artifact checks', () => {
    const directive = baseDirective();
    const artifact = checklistArtifact as ConvictionArtifact;

    const bottom = evaluateBottomGate(directive, artifact);
    expect(bottom.pass).toBe(false);
    expect(bottom.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');

    const send = isSendWorthy(directive, artifact);
    expect(send.worthy).toBe(false);
    expect(send.reason).toBe('schedule_conflict_not_finished_outbound');

    expect(getArtifactPersistenceIssues('write_document', artifact, directive).length).toBeGreaterThan(0);

    const persist = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
      candidateType: 'discrepancy',
    });
    expect(persist.some((m) => m.includes('schedule_conflict'))).toBe(true);
  });

  it('rejects production leak pattern when discrepancyClass is missing but headline matches overlap', () => {
    const directive = baseDirective({
      discrepancyClass: undefined,
      generationLog: {
        outcome: 'selected',
        stage: 'persistence',
        reason: 'ok',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 0.1,
          selectionReason: null,
          failureReason: null,
          topCandidates: [],
        },
      },
    });
    const artifact = {
      type: 'document',
      title: 'Overlapping events on 2026-04-02.',
      content:
        'Objective: Overlapping events on 2026-04-02.\n\nExecution Notes:\n- Which takes priority, and how will you communicate the trade-off?',
    } as unknown as ConvictionArtifact;

    expect(evaluateBottomGate(directive, artifact).blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
    expect(isSendWorthy(directive, artifact).worthy).toBe(false);
    expect(getArtifactPersistenceIssues('write_document', artifact, directive).length).toBeGreaterThan(0);
  });

  it('rejects message-shaped schedule_conflict documents', () => {
    const directive = baseDirective();
    const artifact = {
      type: 'document',
      title: 'Overlap note',
      content:
        'Hi Alex,\nWe have overlapping events on 2026-04-02 between "Quarterly review" and "Hiring sync".\nPlease confirm which event to move by 2026-04-01.\nThanks,',
    } as unknown as ConvictionArtifact;

    const issues = getArtifactPersistenceIssues('write_document', artifact, directive);
    expect(issues).toContain('schedule_conflict write_document below product bar; require a real calendar artifact or suppress');
  });

  it('rejects unsectioned overlap notes even if they mention the conflict', () => {
    const directive = baseDirective();
    const artifact = {
      type: 'document',
      title: 'Overlap note',
      content:
        'There is a schedule conflict on 2026-04-02 between "Quarterly review" and "Hiring sync". Choose which commitment keeps the slot and confirm by 2026-04-01.',
    } as unknown as ConvictionArtifact;

    const issues = getArtifactPersistenceIssues('write_document', artifact, directive);
    expect(issues).toContain('schedule_conflict write_document below product bar; require a real calendar artifact or suppress');
  });

  it('does not apply schedule_conflict persistence bar to interview-class write_document on compound directive', () => {
    const directive = baseDirective({
      reason: 'Overlapping calendar same week as confirmed interview with candidate Alex Crisler.',
      evidence: [
        { type: 'signal', description: 'Phone screen interview confirmed for PM role on 2026-03-31' },
      ],
      generationLog: {
        outcome: 'selected',
        stage: 'persistence',
        reason: 'ok',
        candidateFailureReasons: [],
        candidateDiscovery: {
          ...discoveryWithScheduleConflictClass(),
          topCandidates: [
            {
              ...discoveryWithScheduleConflictClass().topCandidates[0],
              targetGoal: { text: 'Interview confirmation draft for Alex Crisler (PM candidate)' },
            },
          ],
        },
      },
    });
    const artifact = {
      type: 'document',
      title: 'Interview confirmation — Alex Crisler',
      content:
        'Confirmed interview with candidate Alex Crisler for the Product Manager role on March 31, 2026. Recruiter and hiring manager are aligned on the schedule.',
    } as unknown as ConvictionArtifact;

    expect(
      getArtifactPersistenceIssues('write_document', artifact, directive).filter((m) =>
        m.includes('schedule_conflict write_document below product bar'),
      ),
    ).toEqual([]);

    const persist = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
      candidateType: 'discrepancy',
    });
    expect(
      persist.some((m) => m.includes('schedule_conflict write_document below product bar')),
    ).toBe(false);
  });

  it('rejects grounded resolution note artifact consistently because schedule-conflict documents are below bar', () => {
    const directive = baseDirective();
    const artifact = {
      type: 'document',
      title: 'Resolution — 2026-04-02 overlap',
      content: `## Situation
Alex's sync and the hiring block overlap on 2026-04-02.

## Conflicting commitments or risk
Double-booking forces a trade-off between recruiting and the standing sync.

## Recommendation / decision
Move the hiring block to Wednesday afternoon; keep Alex's sync if it is immovable for the team.

## Owner / next step
Please confirm whether you can move the hiring block before 2026-04-01 so calendars update.

## Timing / deadline
Decide by 2026-04-01 EOD; conflict is on 2026-04-02.`,
    } as unknown as ConvictionArtifact;

    const bottom = evaluateBottomGate(directive, artifact);
    expect(bottom.pass).toBe(false);
    expect(bottom.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');

    const send = isSendWorthy(directive, artifact);
    expect(send.worthy).toBe(false);
    expect(send.reason).toBe('schedule_conflict_not_finished_outbound');

    expect(getArtifactPersistenceIssues('write_document', artifact, directive)).toContain(
      'schedule_conflict write_document below product bar; require a real calendar artifact or suppress',
    );

    const persist = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
      candidateType: 'discrepancy',
    });
    expect(persist).toContain('schedule_conflict write_document below product bar; require a real calendar artifact or suppress');

    const de = getDecisionEnforcementIssues({
      actionType: 'write_document',
      directiveText: directive.directive,
      reason: directive.reason ?? '',
      artifact,
      discrepancyClass: 'schedule_conflict',
    });
    expect(de.length).toBe(0);
  });
});
