import { describe, it, expect } from 'vitest';
import { evaluateBottomGate, type BottomGateBlockReason } from '../daily-brief-generate';
import type { ConvictionDirective, ConvictionArtifact } from '@/lib/briefing/types';

function makeDirective(overrides: Partial<ConvictionDirective> = {}): ConvictionDirective {
  return {
    directive: 'Send the updated proposal to Sarah Chen by Friday.',
    action_type: 'send_message',
    confidence: 80,
    reason: 'Sarah requested the revised numbers by end of week or the deal expires.',
    evidence: [{ type: 'signal', description: 'Email from Sarah Chen re: proposal deadline' }],
    ...overrides,
  };
}

function makeEmailArtifact(overrides: Record<string, unknown> = {}): ConvictionArtifact {
  return {
    type: 'drafted_email',
    to: 'sarah.chen@example.com',
    subject: 'Updated proposal — confirm by Friday',
    body: 'Hi Sarah, please confirm the revised numbers by Friday or we lose the vendor window.',
    ...overrides,
  } as unknown as ConvictionArtifact;
}

function makeDocArtifact(overrides: Record<string, unknown> = {}): ConvictionArtifact {
  return {
    type: 'decision_frame',
    title: 'Budget approval for Q2 marketing',
    content: 'Approve the $15k allocation by Wednesday or the campaign slot expires. Sarah needs sign-off.',
    ...overrides,
  } as unknown as ConvictionArtifact;
}

describe('evaluateBottomGate', () => {
  it('passes when firstMorningBypass is set (onboarding welcome document)', () => {
    const result = evaluateBottomGate(
      makeDirective({
        action_type: 'write_document',
        generationLog: {
          outcome: 'selected',
          stage: 'persistence',
          reason: 'first_morning_welcome',
          candidateFailureReasons: [],
          candidateDiscovery: null,
          firstMorningBypass: true,
        },
      }),
      makeDocArtifact({ type: 'document', content: 'Short memo without deadline language.'.repeat(3) }),
    );
    expect(result.pass).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  it('passes a well-formed send_message with external target, ask, and pressure', () => {
    const result = evaluateBottomGate(makeDirective(), makeEmailArtifact());
    expect(result.pass).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  it('passes a well-formed write_document with external target, ask, and pressure', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Draft the budget approval memo for Sarah Chen by Wednesday.',
    });
    const result = evaluateBottomGate(directive, makeDocArtifact());
    expect(result.pass).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  it('passes an internal execution brief without an external target when it is finished and time-bound', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Write the answer architecture for the Care Coordinator interview before April 15.',
      reason: 'The interview is on April 15 and a generic answer weakens fit before the window closes.',
    });
    const artifact = makeDocArtifact({
      type: 'document',
      document_purpose: 'interview answer architecture',
      target_reader: 'candidate',
      title: 'Care Coordinator — role-specific answer architecture',
      content: [
        'Use this in the April 15 phone screen when they ask why you are a fit for the Care Coordinator role.',
        '',
        'Deadline: April 15.',
        '',
        'This is a real interview risk: if this answer stays generic, you lose the clearest fit signal before April 15 and the panel only hears motivation.',
        '',
        'Answer script:',
        'Open with the community-based client support, the reimbursed travel, and the resource coordination already named in the recruiter thread.',
      ].join('\n'),
    });

    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  // --- BLOCK: self-referential document ---
  it('blocks a self-referential reflection memo', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Write a reflection on your priorities for the week.',
    });
    const artifact = makeDocArtifact({
      title: 'Personal reflection on priorities',
      content: 'Reflecting on my goals and considering the following areas for improvement.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('SELF_REFERENTIAL_DOCUMENT');
  });

  // --- BLOCK: no external target ---
  it('blocks send_message with no real recipient', () => {
    const artifact = makeEmailArtifact({ to: 'not-an-email' });
    const result = evaluateBottomGate(makeDirective(), artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_EXTERNAL_TARGET');
  });

  it('blocks write_document with no external person mentioned', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'list all open items to complete by end of week.',
      reason: 'several tasks are overdue and need to be confirmed by end of week.',
    });
    const artifact = makeDocArtifact({
      title: 'open items',
      content: 'please confirm the review is done by end of week or the window expires.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_EXTERNAL_TARGET');
  });

  it('blocks behavioral-pattern close-loop docs that only refer to "This thread"', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive:
        'This thread going dark is now blocking the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference.',
      reason:
        'The thread is mentally open, but there is still no named contact or directly approvable move attached to it.',
      generationLog: {
        outcome: 'selected',
        stage: 'generation',
        reason: 'Behavioral pattern winner.',
        candidateFailureReasons: [],
        candidateDiscovery: {
          candidateCount: 1,
          suppressedCandidateCount: 0,
          selectionMargin: 1,
          selectionReason: 'Behavioral pattern selected.',
          failureReason: null,
          topCandidates: [
            {
              id: 'bp-1',
              rank: 1,
              candidateType: 'discrepancy',
              discrepancyClass: 'behavioral_pattern',
              actionType: 'write_document',
              score: 8.9,
              scoreBreakdown: {
                stakes: 4,
                urgency: 0.8,
                tractability: 0.7,
                freshness: 1,
                actionTypeRate: 0.5,
                entityPenalty: 0,
              },
              targetGoal: {
                text: 'Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
                priority: 4,
                category: 'work',
              },
              sourceSignals: [],
              decision: 'selected',
              decisionReason: 'Repeated silence without a grounded close-loop move.',
            },
          ],
        },
      },
    });
    const artifact = makeDocArtifact({
      type: 'document',
      document_purpose: 'close_the_loop',
      target_reader: 'user',
      title:
        'This thread going dark is now blocking the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference',
      content: [
        'You were trying to get this thread to a real yes/no on the Land MAS3 Management Analyst Supervisor position at HCA and establish 12-month tenure with clean supervisor reference.',
        '',
        'Send this today:',
        '',
        '“I’ve followed up a few times and don’t want to keep this half-open if priorities have shifted. Is this something you still want to pursue, or should I close the loop on my side?”',
        '',
        'Consequence: if this stays open past today, the goal stays blocked while attention keeps leaking into a thread that is no longer moving.',
        '',
        'If there is no reply after this, mark the thread stalled and stop allocating attention to it.',
        '',
        'Deadline: today',
      ].join('\n'),
    });

    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_EXTERNAL_TARGET');
  });

  it('blocks an internal execution brief that is really a prep checklist', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Write the answer architecture for the Care Coordinator interview before April 15.',
      reason: 'The interview is on April 15 and a generic answer weakens fit before the window closes.',
    });
    const artifact = makeDocArtifact({
      type: 'document',
      document_purpose: 'interview answer architecture',
      target_reader: 'candidate',
      title: 'Care Coordinator interview prep',
      content: [
        '1. Prepare two client stories for the panel.',
        '2. Review the organization website before the interview.',
        '3. Research the latest policy changes and gather examples.',
        'Deadline: April 15.',
      ].join('\n'),
    });

    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
    expect(result.blocked_reasons).not.toContain('NO_EXTERNAL_TARGET');
  });

  // --- BLOCK: no concrete ask (write_document — send_message is exempt) ---
  it('blocks a write_document with no concrete ask', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Prepare the spending analysis for Sarah Chen before the Friday deadline.',
      reason: 'Behavioral observation from recent signals.',
    });
    const artifact = makeDocArtifact({
      title: 'Spending analysis',
      content: 'Sarah Chen — spending is higher than expected this month. The deadline is Friday.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_CONCRETE_ASK');
  });

  // --- BLOCK: no real pressure (write_document — send_message is exempt) ---
  it('blocks a write_document with no deadline or consequence', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Share the updated numbers with Sarah Chen.',
      reason: 'She mentioned wanting the latest figures.',
    });
    const artifact = makeDocArtifact({
      title: 'Updated numbers',
      content: 'Sarah Chen, could you confirm these revised numbers look correct?',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_REAL_PRESSURE');
  });

  // --- BLOCK: generic social motion (write_document — send_message is exempt) ---
  it('blocks a write_document with generic social motion language', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Draft a reconnect note for Mike Thompson by Friday.',
      reason: 'Relationship cooling detected — last contact 30 days ago. Deadline is Friday.',
    });
    const artifact = makeDocArtifact({
      title: 'Mike Thompson — reconnect note',
      content:
        'Just to say hi — Mike Thompson. Could you confirm a good time to catch up by Friday?',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('GENERIC_SOCIAL_MOTION');
  });

  // --- PASS: warm reconnection send_message bypasses ask/pressure/social checks ---
  it('passes a warm reconnection send_message with no hard ask or deadline', () => {
    const directive = makeDirective({
      directive: 'Reach out to reconnect with Mike Thompson.',
      reason: 'Relationship cooling detected — last contact 35 days ago.',
    });
    const artifact = makeEmailArtifact({
      to: 'mike@example.com',
      subject: 'Checking in',
      body: 'Hi Mike, hope all is well. I have been thinking about our conversation at the conference and wanted to reconnect.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  // --- BLOCK: non-executable artifact ---
  it('blocks artifacts that are frameworks or question lists', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Prepare key questions for the vendor review with Sarah by Friday.',
    });
    const artifact = makeDocArtifact({
      title: 'Key questions for vendor review',
      content: 'Key considerations and questions to ask yourself before the meeting. Sarah needs sign-off by Friday.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NON_EXECUTABLE_ARTIFACT');
  });

  // --- Multiple block reasons ---
  it('returns all applicable block reasons, not just the first', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Write my thoughts on the situation.',
    });
    const artifact = makeDocArtifact({
      title: 'Personal reflection',
      content: 'Reflecting on my analysis and considering the following areas for improvement. Food for thought on next steps to consider.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons.length).toBeGreaterThanOrEqual(2);
    expect(result.blocked_reasons).toContain('SELF_REFERENTIAL_DOCUMENT');
    expect(result.blocked_reasons).toContain('NON_EXECUTABLE_ARTIFACT');
  });

  it('blocks schedule_conflict write_document when content is a numbered owner checklist', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      discrepancyClass: 'schedule_conflict',
      directive: 'Resolve overlapping events on 2026-04-02',
      reason: 'Two calendar events occupy the same window.',
    });
    const artifact = makeDocArtifact({
      type: 'document',
      title: 'Calendar conflict — 2026-04-02',
      content:
        '1. Decide which event keeps the slot on 2026-04-02.\n2. Decline the other in Outlook.\n3. Notify family if plans shift.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
  });

  it('blocks schedule_conflict write_document that is message-shaped (MESSAGE TO + salutation)', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      discrepancyClass: 'schedule_conflict',
      directive: 'Resolve overlapping events on 2026-04-02',
      reason: 'Two calendar events occupy the same window.',
    });
    const artifact = makeDocArtifact({
      type: 'document',
      title: 'Outbound — 2026-04-02 overlap',
      content:
        'MESSAGE TO Jamie (SMS):\n\nHi Jamie — I am double-booked on 2026-04-02. Could we move our call to Thursday morning?',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
  });

  it('blocks schedule_conflict write_document even when it looks like a complete resolution note', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      discrepancyClass: 'schedule_conflict',
      directive: 'Resolve overlapping events on 2026-04-02',
      reason: 'Two calendar events occupy the same window.',
    });
    const artifact = makeDocArtifact({
      type: 'document',
      title: 'Calendar conflict — 2026-04-02',
      content: `## Situation
Two blocks overlap on 2026-04-02: "Team sync" and "Dentist".

## Conflicting commitments or risk
Both are time-bounded; double-booking forces a priority call.

## Recommendation / decision
Keep the dentist (hard to reschedule); move Team sync to Thursday 4pm or delegate your seat.

## Owner / next step
You confirm with the organizer before 2026-04-01 EOD which option holds.

## Timing / deadline
Decide by 2026-04-01 COB; the overlap on 2026-04-02 is not recoverable otherwise.`,
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
  });

  it('blocks schedule_conflict write_document with production leak shape: Objective + Execution Notes + user-directed questions', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Overlapping events on 2026-04-02.',
      reason: 'Two calendar blocks overlap.',
    });
    const artifact = makeDocArtifact({
      type: 'document',
      title: 'Overlapping events on 2026-04-02.',
      content:
        'Objective: Overlapping events on 2026-04-02.\n\nExecution Notes:\n- Which takes priority, and how will you communicate the trade-off?',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
  });

  // --- Ensure good winners survive ---
  it('passes a send_message with a real business ask and deadline', () => {
    const directive = makeDirective({
      directive: 'Reply to David Park confirming the Tuesday demo slot before the calendar hold expires.',
      reason: 'Calendar hold expires tomorrow. David sent a time confirmation request.',
    });
    const artifact = makeEmailArtifact({
      to: 'david.park@company.com',
      subject: 'Confirmed for Tuesday demo',
      body: 'Hi David, confirmed for Tuesday at 2pm. Please send the deck by Monday EOD so I can review before the deadline.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  const discrepancyDiscovery = {
    candidateCount: 1,
    suppressedCandidateCount: 0,
    selectionMargin: null as number | null,
    selectionReason: null as string | null,
    failureReason: null as string | null,
    topCandidates: [
      {
        id: 'cand-disc',
        rank: 1,
        candidateType: 'discrepancy',
        actionType: 'write_document' as const,
        score: 4,
        scoreBreakdown: { actionTypeRate: 0.7, entityPenalty: 0, final_score: 4 },
        targetGoal: null,
        sourceSignals: [],
        decision: 'selected' as const,
        decisionReason: 'test',
      },
    ],
  };

  it('blocks discrepancy write_document that is a chore / triage list (FINISHED_WORK_REQUIRED)', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Name the avoidance pattern across vendors.',
      reason: 'Multiple inbound threads show no replies in 14 days.',
      generationLog: {
        outcome: 'selected',
        stage: 'persistence',
        reason: 'test',
        candidateFailureReasons: [],
        candidateDiscovery: discrepancyDiscovery,
      },
    });
    const artifact = makeDocArtifact({
      type: 'document',
      title: 'Inbox triage',
      content:
        'Suggested approach:\n1. Complete Teladoc survey before Friday.\n2. Schedule Chase payment in the app.\nSarah Chen needs sign-off by Wednesday.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('FINISHED_WORK_REQUIRED');
  });

  it('passes discrepancy write_document with substantive drafted content (no chore list)', () => {
    const directive = makeDirective({
      action_type: 'write_document',
      directive: 'Draft replies to Pat for three unanswered threads.',
      reason: 'Pat Lee sent four messages in 12 days with no outbound reply.',
      generationLog: {
        outcome: 'selected',
        stage: 'persistence',
        reason: 'test',
        candidateFailureReasons: [],
        candidateDiscovery: discrepancyDiscovery,
      },
    });
    const artifact = makeDocArtifact({
      type: 'document',
      title: 'Replies — Pat Lee',
      content:
        '--- Thread: Roadmap ---\nHi Pat,\n\nThanks for the questions on the roadmap. Here is the timeline we discussed: Phase 1 ships by March 15.\n\nBest,\n',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.blocked_reasons).not.toContain('FINISHED_WORK_REQUIRED');
  });
});
