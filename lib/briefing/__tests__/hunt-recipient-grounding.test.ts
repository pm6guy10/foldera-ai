import { describe, expect, it } from 'vitest';
import {
  applyHuntSendMessageRecipientCoercion,
  buildStructuredContext,
  collectHuntSendMessageToValidationIssues,
} from '../generator';
import type { ScoredLoop } from '../scorer';

const emptyGuard = { approvedRecently: [] as never[], skippedRecently: [] as never[] };

const baseBreakdown = {
  stakes: 1,
  urgency: 1,
  tractability: 1,
  freshness: 1,
  actionTypeRate: 0.5,
  entityPenalty: 0,
  final_score: 5,
} as const;

function huntWinner(sourceIds: string[], relationshipContext?: string): ScoredLoop {
  return {
    id: 'hunt_test',
    type: 'hunt',
    title: 'Unreplied inbound',
    content: 'Hunt summary for tests.',
    suggestedActionType: 'send_message',
    matchedGoal: null,
    score: 5,
    breakdown: { ...baseBreakdown },
    relatedSignals: [],
    sourceSignals: sourceIds.map((id) => ({ kind: 'signal' as const, id })),
    confidence_prior: 70,
    lifecycle: {
      state: 'active_now',
      horizon: 'now',
      actionability: 'actionable',
      reason: 'test',
    },
    ...(relationshipContext !== undefined ? { relationshipContext } : {}),
  };
}

describe('hunt recipient grounding (buildStructuredContext)', () => {
  it('does not treat unrelated LIFE_CONTEXT senders as has_real_recipient', () => {
    const winner = huntWinner(['sig-hunt-1']);
    const userEmails = new Set(['owner@test.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Statement',
        snippet: 'Your FICO score',
        author: 'Amex <noreply@notification.americanexpress.com>',
        direction: 'received' as const,
        signal_id: 'sig-hunt-1',
      },
      {
        source: 'gmail',
        date: '2026-04-02',
        subject: 'Other',
        snippet: 'unrelated',
        author: 'Someone <colleague@example-client.com>',
        direction: 'received' as const,
        signal_id: 'sig-other-99',
      },
    ];

    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test-1',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );

    expect(ctx.has_real_recipient).toBe(false);
    expect(ctx.recipient_brief).toBeNull();
    expect(ctx.surgical_raw_facts.some((l) => l.includes('colleague@'))).toBe(false);
  });

  it('grounds send_message peer to winning signal row only (human author)', () => {
    const winner = huntWinner(['sig-a']);
    const userEmails = new Set(['me@me.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Re: Project',
        snippet: 'Following up',
        author: 'Alex Rivera <alex@clientco.com>',
        direction: 'received' as const,
        signal_id: 'sig-a',
      },
      {
        source: 'gmail',
        date: '2026-04-03',
        snippet: 'noise',
        subject: 'Other',
        author: 'Other <other@elsewhere.com>',
        direction: 'received' as const,
        signal_id: 'sig-b',
      },
    ];

    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test-2',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );

    expect(ctx.has_real_recipient).toBe(true);
    expect(ctx.recipient_brief).toContain('alex@clientco.com');
    expect(ctx.surgical_raw_facts.some((l) => l.startsWith('hunt_grounded_peer_email:'))).toBe(true);
    expect(ctx.surgical_raw_facts.some((l) => l.includes('other@elsewhere.com'))).toBe(false);
  });
});

describe('hunt send_message artifact.to validation (collectHuntSendMessageToValidationIssues)', () => {
  it('a) hunt with grounded external peer on winning signal passes allowlist + validation', () => {
    const winner = huntWinner(['sig-a']);
    const userEmails = new Set(['me@me.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Re: Project',
        snippet: 'Following up',
        author: 'Alex Rivera <alex@clientco.com>',
        direction: 'received' as const,
        signal_id: 'sig-a',
      },
    ];
    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );
    expect(ctx.hunt_send_message_recipient_allowlist).toContain('alex@clientco.com');
    expect(
      collectHuntSendMessageToValidationIssues(ctx, 'send_message', 'alex@clientco.com'),
    ).toEqual([]);
  });

  it('d) hallucinated unrelated syntactically valid email fails validation', () => {
    const winner = huntWinner(['sig-a']);
    const userEmails = new Set(['me@me.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Re: Project',
        snippet: 'Following up',
        author: 'Alex Rivera <alex@clientco.com>',
        direction: 'received' as const,
        signal_id: 'sig-a',
      },
    ];
    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );
    const bad = collectHuntSendMessageToValidationIssues(
      ctx,
      'send_message',
      'wfe-6921e4b356ccff5a5f336b22@outlier.ai',
    );
    expect(bad.length).toBe(1);
    expect(bad[0]).toContain('hunt-grounded recipient');
  });

  it('b) hunt with only noreply on winning signal — empty allowlist, no send_message recipient', () => {
    const winner = huntWinner(['sig-hunt-1']);
    const userEmails = new Set(['owner@test.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Statement',
        snippet: 'Your FICO score',
        author: 'Amex <noreply@notificationmycredit-guide.americanexpress.com>',
        direction: 'received' as const,
        signal_id: 'sig-hunt-1',
      },
    ];
    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );
    expect(ctx.hunt_send_message_recipient_allowlist).toEqual([]);
    expect(ctx.has_real_recipient).toBe(false);
    const issues = collectHuntSendMessageToValidationIssues(
      ctx,
      'send_message',
      'anyone@example.com',
    );
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('no hunt-grounded recipient');
  });

  it('c) relationshipContext-only email not on winning hunt thread cannot authorize artifact.to', () => {
    const rc =
      'Other Person <wfe-6921e4b356ccff5a5f336b22@outlier.ai> | role | company';
    const winner = huntWinner(['sig-hunt-amex'], rc);
    const userEmails = new Set(['owner@test.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Statement ready',
        snippet: 'View your statement',
        author: 'Amex <noreply@notification.americanexpress.com>',
        direction: 'received' as const,
        signal_id: 'sig-hunt-amex',
      },
    ];
    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );
    expect(ctx.hunt_send_message_recipient_allowlist).toEqual([]);
    expect(ctx.has_real_recipient).toBe(false);
    expect(
      ctx.surgical_raw_facts.some((l) => l.includes('wfe-6921e4b356ccff5a5f336b22@outlier.ai')),
    ).toBe(false);
    const issues = collectHuntSendMessageToValidationIssues(
      ctx,
      'send_message',
      'wfe-6921e4b356ccff5a5f336b22@outlier.ai',
    );
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('no hunt-grounded recipient');
  });

  it('coerces invented To: to singleton hunt allowlist before validation', () => {
    const winner = huntWinner(['sig-a']);
    const userEmails = new Set(['me@me.com']);
    const evidence = [
      {
        source: 'gmail',
        date: '2026-04-01',
        subject: 'Re: Project',
        snippet: 'Following up',
        author: 'Alex Rivera <alex@clientco.com>',
        direction: 'received' as const,
        signal_id: 'sig-a',
      },
    ];
    const ctx = buildStructuredContext(
      winner,
      emptyGuard,
      'user-test',
      evidence,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userEmails,
    );
    expect(ctx.hunt_send_message_recipient_allowlist).toEqual(['alex@clientco.com']);

    const parsed = {
      action: 'send_message' as const,
      artifact_type: 'send_message' as const,
      confidence: 80,
      reason: 'test',
      directive: 'Follow up with Alex about the project.',
      insight: 'test',
      why_now: 'test',
      decision: 'ACT' as const,
      artifact: {
        to: 'alex.rivera@example.com',
        subject: 'Hi',
        body: 'Body',
      },
    };

    expect(
      collectHuntSendMessageToValidationIssues(ctx, 'send_message', 'alex.rivera@example.com').length,
    ).toBeGreaterThan(0);

    const did = applyHuntSendMessageRecipientCoercion(parsed, ctx, 'send_message');
    expect(did).toBe(true);
    expect((parsed.artifact as { to: string }).to).toBe('alex@clientco.com');
    expect(
      collectHuntSendMessageToValidationIssues(
        ctx,
        'send_message',
        (parsed.artifact as { to: string }).to,
      ).length,
    ).toBe(0);
  });
});
