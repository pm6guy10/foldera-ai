import { describe, expect, it } from 'vitest';
import type { ConvictionDirective } from '../types';
import { validateDirectiveForPersistence } from '../generator';

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
        expect.stringContaining('decision_enforcement:missing_explicit_ask'),
        expect.stringContaining('decision_enforcement:missing_time_constraint'),
        expect.stringContaining('decision_enforcement:missing_pressure_or_consequence'),
      ]),
    );
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
        expect.stringContaining('decision_enforcement:missing_explicit_ask'),
        expect.stringContaining('decision_enforcement:missing_time_constraint'),
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
});

