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

  it('does not promote low-value contest blasts as repeated_ignored_sender (3+ in 30d)', () => {
    const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const iso = (d: number) => new Date(base - d * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('c1', iso(0), 'Brand <hello@brand.com>', 'Weekly caption contest', 'Submit your caption today'),
      mailReceived('c2', iso(10), 'Brand <hello@brand.com>', 'Caption contest reminder', 'Enter to win'),
      mailReceived('c3', iso(20), 'Brand <hello@brand.com>', 'Last chance: caption contest', 'Official contest rules inside'),
    ];
    const { countsByKind, findings } = runHuntAnomalies({ signals, commitments: [] });
    expect(countsByKind.repeated_ignored_sender).toBe(0);
    expect(findings.filter((f) => f.kind === 'repeated_ignored_sender')).toHaveLength(0);
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

  it('does not promote singular notification senders as repeated_ignored_sender hunt candidates', () => {
    const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const iso = (d: number) => new Date(base - d * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('s1', iso(0), 'Slack <notification@slack.com>', 'You have unread messages'),
      mailReceived('s2', iso(10), 'Slack <notification@slack.com>', 'Henry sent you messages'),
      mailReceived('s3', iso(20), 'Slack <notification@slack.com>', 'James mentioned everyone'),
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

  it('does not flag caption-contest / promo blast as unreplied_inbound even when sender is trusted', () => {
    const recvIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived(
        'cc1',
        recvIso,
        'Outlier <community@outlier.ai>',
        "This week's caption contest — submit now!",
        'Enter your caption for a chance to win swag. No purchase necessary.',
      ),
    ];
    const trusted = new Set(['community@outlier.ai']);
    const { countsByKind, findings } = runHuntAnomalies({
      signals,
      commitments: [],
      trustedSenderEmails: trusted,
    });
    expect(countsByKind.unreplied_inbound).toBe(0);
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('does not admit unreplied_inbound when promo cues appear only deep in the body (past 400-char preview)', () => {
    const recvIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const deepBody = `${'x'.repeat(500)}\n\nOfficial contest rules: enter the photo contest to win.`;
    const signals = [
      mailReceived('deep1', recvIso, 'Brand <hello@humanbrand.io>', 'FYI', deepBody),
    ];
    const trusted = new Set(['hello@humanbrand.io']);
    const { countsByKind, findings } = runHuntAnomalies({
      signals,
      commitments: [],
      trustedSenderEmails: trusted,
    });
    expect(countsByKind.unreplied_inbound).toBe(0);
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('does not admit repeated ignored sender when sender is not in trustedSenderEmails', () => {
    const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const iso = (d: number) => new Date(base - d * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived('u1', iso(0), 'Cold Sender <cold@unknown.com>', 'Thread A'),
      mailReceived('u2', iso(10), 'Cold Sender <cold@unknown.com>', 'Thread B'),
      mailReceived('u3', iso(20), 'Cold Sender <cold@unknown.com>', 'Thread C'),
    ];
    const { countsByKind, findings } = runHuntAnomalies({
      signals,
      commitments: [],
      trustedSenderEmails: new Set(['known@trusted.com']),
    });
    expect(countsByKind.repeated_ignored_sender).toBe(0);
    expect(findings.filter((f) => f.kind === 'repeated_ignored_sender')).toHaveLength(0);
  });

  it('does not admit Microsoft Bookings verification mail as unreplied_inbound even when sender is trusted', () => {
    const recvIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived(
        'book1',
        recvIso,
        'Alex Crisler <Alex.Crisler@comphc.org>',
        'Verify your email address',
        'Your Microsoft Bookings verification code is 123456. This is an automatically-generated message from the bookings page.',
      ),
    ];
    const trusted = new Set(['alex.crisler@comphc.org']);
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

  it('does not flag DMARC aggregate reports as unreplied_inbound even when sender is trusted', () => {
    const recvIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [
      mailReceived(
        'dmarc1',
        recvIso,
        'DMARC Aggregate Report <dmarcreport@microsoft.com>',
        'Report Domain: foldera.ai Submitter: protection.outlook.com',
      ),
    ];
    const trusted = new Set(['dmarcreport@microsoft.com']);
    const { countsByKind, findings } = runHuntAnomalies({
      signals,
      commitments: [],
      trustedSenderEmails: trusted,
    });
    expect(countsByKind.unreplied_inbound).toBe(0);
    expect(findings.filter((f) => f.kind === 'unreplied_inbound')).toHaveLength(0);
  });

  it('does not leak the raw signal id into unreplied_inbound evidenceLines (live bug, 2026-07-01)', () => {
    // A UUID-shaped signal id used to be embedded verbatim in evidenceLines
    // ("Signal <id>: ..."), which flows into candidateText downstream and
    // false-positived the pre-model internal-debug-token gate. See
    // artifact-quality-gate.test.ts for the gate-level regression.
    const uuidId = '3f9a2b1c-45de-4f11-8a2b-9d0e1f2a3b4c';
    const recvIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const signals = [mailReceived(uuidId, recvIso, 'Alice <alice@ex.com>', 'Hello there')];
    const { findings } = runHuntAnomalies({ signals, commitments: [] });
    const finding = findings.find((f) => f.kind === 'unreplied_inbound');
    expect(finding).toBeDefined();
    expect(finding!.evidenceLines.join('\n')).not.toContain(uuidId);
  });

  it('does not leak the raw commitment id into commitment_calendar_gap evidenceLines (live bug, 2026-07-01)', () => {
    const uuidId = '7c1e9a4d-22b6-4a55-9f3a-1d8c6e0b5f21';
    const dueAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
    const { findings, countsByKind } = runHuntAnomalies({
      signals: [],
      commitments: [{ id: uuidId, description: 'Submit renewal paperwork', due_at: dueAt, implied_due_at: null }],
    });
    expect(countsByKind.commitment_calendar_gap).toBeGreaterThanOrEqual(1);
    const finding = findings.find((f) => f.kind === 'commitment_calendar_gap');
    expect(finding).toBeDefined();
    expect(finding!.evidenceLines.join('\n')).not.toContain(uuidId);
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
