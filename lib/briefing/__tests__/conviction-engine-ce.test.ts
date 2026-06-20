import { describe, expect, it } from 'vitest';
import {
  detectReferenceRiskBlindspot,
  hiringFunnelTierFromPlaintext,
  inferPrimaryOutcomeDeadline,
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

describe('inferPrimaryOutcomeDeadline (#431)', () => {
  // Anchor "now" to Feb 2026 so month-rolling is deterministic regardless of run date.
  const NOW = new Date(Date.UTC(2026, 1, 15)); // 2026-02-15

  it('extracts "<month> start" → 1st of that month', () => {
    const { date, source } = inferPrimaryOutcomeDeadline(
      ['Welcome aboard — your April start is confirmed with HR.'],
      NOW,
    );
    expect(date?.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(source).toContain('April start');
  });

  it('extracts "starts in <month>" phrasing', () => {
    const { date } = inferPrimaryOutcomeDeadline(
      ['The role starts in May once onboarding clears.'],
      NOW,
    );
    expect(date?.toISOString().slice(0, 10)).toBe('2026-05-01');
  });

  it('extracts "start date <month>" phrasing', () => {
    const { date } = inferPrimaryOutcomeDeadline(['Proposed start date June, pending references.'], NOW);
    expect(date?.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('picks the EARLIEST month when a range is given ("April/May start")', () => {
    const { date } = inferPrimaryOutcomeDeadline(['Targeting an April/May start for the new analyst.'], NOW);
    expect(date?.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('picks the earliest cue across multiple signals', () => {
    const { date } = inferPrimaryOutcomeDeadline(
      ['They mentioned a June start.', 'Actually onboarding starts in April.'],
      NOW,
    );
    expect(date?.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('rolls a past month to next year', () => {
    const { date } = inferPrimaryOutcomeDeadline(['Your January start is locked in.'], NOW);
    expect(date?.toISOString().slice(0, 10)).toBe('2027-01-01');
  });

  it('stays quiet on the modal "may start" (no fabricated deadline)', () => {
    const { date, source } = inferPrimaryOutcomeDeadline(
      ['Once paperwork clears you may start the onboarding modules.'],
      NOW,
    );
    expect(date).toBeNull();
    expect(source).toBeNull();
  });

  it('returns null when no start/month cue is present', () => {
    const { date, source } = inferPrimaryOutcomeDeadline(
      ['Thanks for the update on the Q2 budget review.'],
      NOW,
    );
    expect(date).toBeNull();
    expect(source).toBeNull();
  });
});
