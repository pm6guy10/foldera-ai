import { describe, expect, it } from 'vitest';
import type { ConvictionDirective } from '../types';
import { getWriteDocumentMode, validateDirectiveForPersistence } from '../generator';

function baseDirective(overrides: Partial<ConvictionDirective> = {}): ConvictionDirective {
  return {
    directive: 'Send a decision request to lock owner and deadline for the approval thread.',
    action_type: 'send_message',
    confidence: 82,
    reason: 'Approval path is blocked until an explicit owner confirms the decision window.',
    evidence: [{ type: 'signal', description: 'Approver requested a named owner and deadline in the latest thread.' }],
    ...overrides,
  };
}

describe('artifact decision enforcement', () => {
  it('rejects ignorable send_message artifacts with no ask/time/pressure', () => {
    const directive = baseDirective({
      directive: 'Follow up with the reviewer.',
      reason: 'Status thread is quiet.',
    });
    const artifact = {
      type: 'email',
      to: 'reviewer@example.com',
      subject: 'Following up',
      body: 'Just checking in on this thread. Wanted to follow up and see if you had any updates.',
      draft_type: 'email_compose',
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('decision_enforcement:missing_time_constraint'),
        expect.stringContaining('decision_enforcement:missing_pressure_or_consequence'),
      ]),
    );
  });

  it('accepts send_message when a real question appears despite follow-up / checking-in openers', () => {
    const directive = baseDirective({
      directive: 'Send a short check-in on the open thread.',
      reason: 'Vendor has not confirmed after prior nudges.',
    });
    const artifact = {
      type: 'email',
      to: 'vendor@example.com',
      subject: 'Following up on the contract',
      body: 'Hi — I wanted to follow up and check in on this thread. There have been no replies in the past 10 days — are you still able to send the countersign by Friday?',
      draft_type: 'email_compose',
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues.filter((issue) => issue.includes('decision_enforcement:'))).toHaveLength(0);
  });

  it('accepts send_message when body has a question plus recent-days timing and no-reply pressure', () => {
    const directive = baseDirective({
      directive: 'Ask Aya whether the contract review is still active.',
      reason: 'Multiple inbound messages in the last 30 days with no acknowledgment.',
    });
    const artifact = {
      type: 'email',
      to: 'aya@healthcare.example',
      subject: 'Contract review — status',
      body: 'Hi — are you still planning to finish review this week? There have been no replies to the last three messages in the past 14 days.',
      draft_type: 'email_compose',
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues.filter((issue) => issue.includes('decision_enforcement:'))).toHaveLength(0);
  });

  it('accepts send_message artifact that forces a decision with deadline and consequence', () => {
    const directive = baseDirective({
      directive: 'Request a yes/no decision and owner assignment for the approval packet by 4 PM PT today.',
    });
    const artifact = {
      type: 'email',
      to: 'approver@example.com',
      subject: 'Decision needed today: owner + approval path by 4 PM PT',
      body: 'Can you confirm by 4 PM PT today whether we approve path A or path B, and name the owner responsible for execution? If we miss this cutoff, the board packet slips to next week.',
      draft_type: 'email_compose',
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues.filter((issue) => issue.includes('decision_enforcement:'))).toHaveLength(0);
  });

  it('rejects write_document artifacts that summarize context without forcing movement', () => {
    const directive = baseDirective({
      action_type: 'write_document',
      directive: 'Document the thread status.',
    });
    const artifact = {
      type: 'document',
      title: 'Status Summary',
      content: 'This document summarizes the conversation so far and captures key context for reference.',
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('decision_enforcement:missing_time_constraint'),
        expect.stringContaining('decision_enforcement:summary_without_decision'),
      ]),
    );
  });

  it('accepts write_document artifact when it includes explicit ask, deadline, pressure, and ownership', () => {
    const directive = baseDirective({
      action_type: 'write_document',
      directive: 'Draft the decision memo that will be sent for final approval today.',
    });
    const artifact = {
      type: 'document',
      title: 'Final Approval Decision Memo',
      content: [
        'Decision required: choose approval path A or B and assign one accountable owner.',
        'Ask: confirm your choice and owner by 4 PM PT today.',
        'Consequence: missing this deadline pushes the legal filing to next week and increases contractual risk.',
      ].join('\n\n'),
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues.filter((issue) => issue.includes('decision_enforcement:'))).toHaveLength(0);
  });

  it('accepts outbound write_document when the explicit ask is carried by an Ask label', () => {
    const directive = baseDirective({
      action_type: 'write_document',
      directive: 'Draft the stakeholder status note that locks today\'s owner decision.',
      reason: 'Go-live is still blocked until one owner is named today.',
    });
    const artifact = {
      type: 'document',
      document_purpose: 'stakeholder status note',
      target_reader: 'Acme stakeholders',
      title: 'Acme Integration — Status Report',
      content: [
        'Decision required: security sign-off still lacks one accountable owner for the April 27 go-live.',
        'Ask: path A or path B by 4 PM PT today, with one named owner.',
        'Consequence: if unresolved today, launch slips and onboarding stays blocked next week.',
      ].join('\n\n'),
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues.filter((issue) => issue.includes('decision_enforcement:missing_explicit_ask'))).toHaveLength(0);
  });

  it('keeps external stakeholder write_document in outbound mode even when candidate context mentions an interview', () => {
    const mode = getWriteDocumentMode({
      actionType: 'write_document',
      candidateTitle: 'Follow up with the MAS3 hiring manager before the interview window closes',
      directiveText: 'Send the Acme integration status report to their stakeholders before Thursday.',
      reason: 'Security sign-off is due within 48 hours and the accountable owner is still undefined.',
      artifact: {
        document_purpose: 'Update Acme stakeholders on integration scope, timeline, and open blockers',
        target_reader: 'Acme stakeholders',
        title: 'Acme Integration — Status Report',
        content: [
          'Decision required: confirm by 4 PM PT today whether we proceed with April 27 go-live.',
          'Ask: path A or path B by 4 PM PT today, with one named owner.',
          'Consequence: if unresolved today, launch slips and onboarding stays blocked next week.',
        ].join('\n\n'),
      },
    });

    expect(mode).toBe('outbound_resolution_note');
  });

  it('accepts an internal execution brief without external owner assignment when it is directly usable', () => {
    const directive = baseDirective({
      action_type: 'write_document',
      directive: 'Write the role-specific answer architecture for the Care Coordinator interview before April 15.',
      reason: 'The interview is already scheduled for April 15 and a generic answer will weaken fit.',
    });
    const artifact = {
      type: 'document',
      document_purpose: 'interview answer architecture',
      target_reader: 'candidate',
      title: 'Care Coordinator — role-specific answer architecture',
      content: [
        'Use this in the phone screen on April 15 when they ask why you are a fit for the Care Coordinator role.',
        '',
        'Deadline: April 15.',
        '',
        'This is a real interview risk: if this answer stays generic, you lose the clearest fit signal before April 15 and the panel only hears motivation.',
        '',
        'Answer script:',
        'Lead with the community-based recovery work, the mileage-reimbursed home visits, and the client-resource coordination already named in the recruiter thread.',
      ].join('\n'),
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
    });

    expect(issues.filter((issue) => issue.includes('decision_enforcement:'))).toHaveLength(0);
  });

  it('rejects behavioral-pattern close-loop docs that never ground the recipient beyond "This thread"', () => {
    const directive = baseDirective({
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
    const artifact = {
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
    };

    const issues = validateDirectiveForPersistence({
      userId: 'user-1',
      directive,
      artifact,
      candidateType: 'discrepancy',
      matchedGoalCategory: 'work',
    });

    expect(issues).toContain('decision_enforcement:behavioral_pattern_missing_grounded_target');
  });
});
