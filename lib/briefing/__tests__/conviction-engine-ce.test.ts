import { describe, expect, it } from 'vitest';
import {
  detectReferenceRiskBlindspot,
  hiringFunnelTierFromPlaintext,
} from '../conviction-engine';

describe('hiringFunnelTierFromPlaintext (CE-4)', () => {
  it('maps reference complete to 0.75', () => {
    const t = hiringFunnelTierFromPlaintext('Great news — reference check complete for Yadira.');
    expect(t?.label).toContain('Reference');
    expect(t?.probability).toBe(0.75);
  });

  it('prefers more advanced stage (offer over applied)', () => {
    const t = hiringFunnelTierFromPlaintext('We are pleased to extend an offer letter for the role.');
    expect(t?.probability).toBe(0.9);
  });

  it('maps applied to 0.20', () => {
    const t = hiringFunnelTierFromPlaintext('Your application was received and is under review.');
    expect(t?.probability).toBe(0.2);
  });

  it('maps reference initiated to 0.55', () => {
    const t = hiringFunnelTierFromPlaintext(
      'Your reference check was initiated today; we will follow up once complete.',
    );
    expect(t?.probability).toBe(0.55);
  });
});

describe('detectReferenceRiskBlindspot (CE-6)', () => {
  it('returns null when WA job context missing', () => {
    expect(detectReferenceRiskBlindspot('Land role at DVA', ['thread about benefits'])).toBeNull();
  });

  it('returns note when WA state job + DVA both present', () => {
    const note = detectReferenceRiskBlindspot('Washington state analyst application', [
      'Prior DVA supervisor may not be available for WA state HR reference policy.',
    ]);
    expect(note).toContain('REFERENCE_RISK');
    expect(note).toContain('WA');
  });
});
