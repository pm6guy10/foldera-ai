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

  // --- BLOCK: no concrete ask ---
  it('blocks a directive with no concrete ask', () => {
    const directive = makeDirective({
      directive: 'The spending pattern shows a contradiction with stated cash goals.',
      reason: 'Behavioral observation from recent signals.',
    });
    const artifact = makeEmailArtifact({
      subject: 'Spending observation',
      body: 'Hi Sarah, I noticed the spending is higher than expected this month. The deadline is Friday.',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_CONCRETE_ASK');
  });

  // --- BLOCK: no real pressure ---
  it('blocks a directive with no deadline or consequence', () => {
    const directive = makeDirective({
      directive: 'Send Sarah Chen the updated numbers.',
      reason: 'She mentioned wanting the latest figures.',
    });
    const artifact = makeEmailArtifact({
      subject: 'Updated numbers',
      body: 'Hi Sarah, could you confirm these revised numbers look correct?',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('NO_REAL_PRESSURE');
  });

  // --- BLOCK: generic social motion ---
  it('blocks generic social check-in emails', () => {
    const directive = makeDirective({
      directive: 'Send a message to reconnect with Mike Thompson by Friday.',
      reason: 'Relationship cooling detected — last contact 30 days ago. Deadline is Friday.',
    });
    const artifact = makeEmailArtifact({
      to: 'mike@example.com',
      subject: 'Catching up',
      body: 'Hi Mike, just to say hi and see how things are going. Could you confirm a time to catch up by Friday?',
    });
    const result = evaluateBottomGate(directive, artifact);
    expect(result.pass).toBe(false);
    expect(result.blocked_reasons).toContain('GENERIC_SOCIAL_MOTION');
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
});
