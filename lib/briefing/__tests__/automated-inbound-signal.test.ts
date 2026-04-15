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
