import { describe, it, expect } from 'vitest';
import { runHuntAnomalies, huntFindingToScoredLoopContent } from '../hunt-anomalies';

function mailReceived(id: string, iso: string, from: string, subject: string, bodyExtra = '') {
  return {
    id,
    content: `[Email received: ${iso}]\nFrom: ${from}\nTo: me@test.com\nSubject: ${subject}\nBody preview: hello ${bodyExtra}`,
    source: 'gmail' as const,
    type: 'email_received' as const,
    occurred_at: new Date(iso).toISOString(),
    author: from.match(/<([^>]+)>/)?.[1] ?? from,
  };
}

function mailSent(id: string, iso: string, to: string, subject: string) {
  return {
    id,
    content: `[Sent email: ${iso}]\nTo: ${to}\nSubject: ${subject}\nBody preview: reply`,
    source: 'gmail' as const,
    type: 'email_sent' as const,
    occurred_at: new Date(iso).toISOString(),
    author: 'self',
  };
}

describe('runHuntAnomalies', () => {
  it('detects repeated ignored sender (3+ in 30d, zero replies)', () => {
    const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const iso = (d: number) => new Date(base - d * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('r1', iso(0), 'Busy Sender <busy@corp.com>', 'Thread A'),
      mailReceived('r2', iso(10), 'Busy Sender <busy@corp.com>', 'Thread B'),
      mailReceived('r3', iso(20), 'Busy Sender <busy@corp.com>', 'Thread C'),
    ];
    const { findings, countsByKind } = runHuntAnomalies({ signals, commitments: [] });
    expect(countsByKind.repeated_ignored_sender).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.kind === 'repeated_ignored_sender')).toBe(true);
  });

  it('does not flag unreplied when a sent reply exists to same address', () => {
    const recvIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const sentIso = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('in1', recvIso, 'Alice <alice@ex.com>', 'Hello there'),
      mailSent('out1', sentIso, 'alice@ex.com', 'Re: Hello there'),
    ];
    const { findings } = runHuntAnomalies({ signals, commitments: [] });
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('does not treat inbound From user mailbox as unanswered external mail', () => {
    const recvIso = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('self1', recvIso, 'Me <owner@mydomain.com>', 'Outbound to vendor'),
    ];
    const selfEmails = new Set(['owner@mydomain.com']);
    const { findings, countsByKind } = runHuntAnomalies({ signals, commitments: [], selfEmails });
    expect(countsByKind.unreplied_inbound).toBe(0);
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('does not promote bulk/marketing senders as repeated_ignored_sender hunt candidates', () => {
    const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const iso = (d: number) => new Date(base - d * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('m1', iso(0), 'Bass Pro <marketing@basspro.com>', 'Sale A'),
      mailReceived('m2', iso(10), 'Bass Pro <marketing@basspro.com>', 'Sale B'),
      mailReceived('m3', iso(20), 'Bass Pro <marketing@basspro.com>', 'Sale C'),
    ];
    const { countsByKind, findings } = runHuntAnomalies({ signals, commitments: [] });
    expect(countsByKind.repeated_ignored_sender).toBe(0);
    expect(findings.filter((f) => f.kind === 'repeated_ignored_sender')).toHaveLength(0);
  });

  it('does not flag repeated ignored sender when From is user mailbox', () => {
    const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const iso = (d: number) => new Date(base - d * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('r1', iso(0), 'Owner <owner@mydomain.com>', 'Thread A'),
      mailReceived('r2', iso(10), 'Owner <owner@mydomain.com>', 'Thread B'),
      mailReceived('r3', iso(20), 'Owner <owner@mydomain.com>', 'Thread C'),
    ];
    const selfEmails = new Set(['owner@mydomain.com']);
    const { countsByKind, findings } = runHuntAnomalies({ signals, commitments: [], selfEmails });
    expect(countsByKind.repeated_ignored_sender).toBe(0);
    expect(findings.some((f) => f.kind === 'repeated_ignored_sender')).toBe(false);
  });

  it('does not flag Outlier wfe-* workflow inbox as unreplied_inbound', () => {
    const recvIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('wfe1', recvIso, 'Outlier <wfe-abc123@outlier.ai>', 'Task available'),
    ];
    const trusted = new Set(['wfe-abc123@outlier.ai']);
    const { countsByKind, findings } = runHuntAnomalies({
      signals,
      commitments: [],
      trustedSenderEmails: trusted,
    });
    expect(countsByKind.unreplied_inbound).toBe(0);
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('does not flag noreply/bulk senders as unreplied_inbound candidates', () => {
    const recvIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('noreply1', recvIso, 'AmEx <noreply@notificationmycredit-guide.americanexpress.com>', 'Your statement is ready'),
      mailReceived('notif1', recvIso, 'CreditKarma <notifications@notifications.creditkarma.com>', 'Score update'),
      mailReceived('mktg1', recvIso, 'Bass Pro <marketing@basspro.com>', 'Big sale'),
    ];
    const { countsByKind, findings } = runHuntAnomalies({ signals, commitments: [] });
    expect(countsByKind.unreplied_inbound).toBe(0);
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('huntFindingToScoredLoopContent includes kind and title', () => {
    const f = {
      kind: 'repeated_ignored_sender' as const,
      id: 'hunt_x',
      title: 'Test title',
      summary: 'Test summary',
      suggestedActionType: 'send_message' as const,
      supportingSignalIds: ['a'],
      evidenceLines: ['line1'],
      severity: 90,
    };
    const c = huntFindingToScoredLoopContent(f);
    expect(c).toContain('HUNT_ANOMALY_FINDING');
    expect(c).toContain('repeated_ignored_sender');
    expect(c).toContain('Test title');
  });
});
