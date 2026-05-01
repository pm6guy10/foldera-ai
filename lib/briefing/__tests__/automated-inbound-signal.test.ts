import { describe, it, expect } from 'vitest';
import {
  extractFromLineFromSignalContent,
  isLikelyAutomatedTransactionalInbound,
} from '../automated-inbound-signal';

describe('automated-inbound-signal', () => {
  it('returns false when From line is missing', () => {
    expect(
      isLikelyAutomatedTransactionalInbound(`[Email received: 2026-01-01]
Subject: Hello
Body preview: x`),
    ).toBe(false);
  });

  it('detects noreply local part', () => {
    const c = `[Email received: 2026-01-01]
From: "Chase" <noreply@notifications.jpmchase.com>
Subject: Alert
Body preview: x`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(true);
  });

  it('detects listed transactional domain', () => {
    const c = `[Email received: 2026-01-01]
From: Venmo <payments@email.venmo.com>
Subject: You paid
Body preview: x`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(true);
  });

  it('detects Resend product onboarding senders as transactional inbound', () => {
    const dev = `[Email received: 2026-01-01]
From: Resend <onboarding@resend.dev>
Subject: Welcome to Resend
Body preview: Get started with your API key`;
    const dotCom = `[Email received: 2026-01-01]
From: Resend <updates@resend.com>
Subject: Account update
Body preview: Your account settings changed`;

    expect(isLikelyAutomatedTransactionalInbound(dev)).toBe(true);
    expect(isLikelyAutomatedTransactionalInbound(dotCom)).toBe(true);
  });

  it('detects subdomain of chase.com', () => {
    const c = `[Email received: 2026-01-01]
From: Chase <service@secure.chase.com>
Subject: Statement
Body preview: x`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(true);
  });

  it('detects DMARC aggregate reports as automated inbound', () => {
    const c = `[Email received: 2026-01-01]
From: DMARC Aggregate Report <dmarcreport@microsoft.com>
Subject: Report Domain: foldera.ai Submitter: protection.outlook.com
Body preview: x`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(true);
  });

  it('detects Microsoft Bookings verification mail from a human-looking sender', () => {
    const c = `[Email received: 2026-01-01]
From: Alex Crisler <Alex.Crisler@comphc.org>
Subject: Verify your email address
Body preview: Your Microsoft Bookings verification code is 123456. This is an automatically-generated message from the bookings page.`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(true);
  });

  it('detects singular notification sender local parts', () => {
    const c = `[Email received: 2026-01-01]
From: Slack <notification@slack.com>
Subject: You have unread messages
Body preview: x`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(true);
  });

  it('does not flag a normal human From', () => {
    const c = `[Email received: 2026-01-01]
From: Holly Stenglein <holly.s@example.com>
Subject: Reference check
Body preview: x`;
    expect(isLikelyAutomatedTransactionalInbound(c)).toBe(false);
  });

  it('extractFromLineFromSignalContent reads first From', () => {
    expect(
      extractFromLineFromSignalContent(`A\nFrom: x <a@b.com>\nFrom: y <c@d.com>`),
    ).toBe('x <a@b.com>');
  });
});
