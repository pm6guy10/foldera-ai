import { describe, it, expect } from 'vitest';
import {
  filterPastSupportingSignals,
  getNewestEvidenceTimestampMs,
  hasPastWinnerSourceSignals,
  needsNoThreadNoOutcomeBlock,
} from '../thread-evidence-for-payload';

describe('thread-evidence-for-payload', () => {
  const fixedNow = new Date('2026-04-04T12:00:00.000Z').getTime();
  const pastIso = '2026-04-01T10:00:00.000Z';
  const futureIso = '2026-04-10T10:00:00.000Z';

  describe('filterPastSupportingSignals', () => {
    it('keeps only past-dated supporting rows relative to now', () => {
      const out = filterPastSupportingSignals(
        [{ occurred_at: pastIso }, { occurred_at: futureIso }],
        fixedNow,
      );
      expect(out).toHaveLength(1);
      expect(out[0].occurred_at).toBe(pastIso);
    });

    it('returns empty when supporting is undefined or all future', () => {
      expect(filterPastSupportingSignals(undefined, fixedNow)).toEqual([]);
      expect(filterPastSupportingSignals([{ occurred_at: futureIso }], fixedNow)).toEqual([]);
    });
  });

  describe('hasPastWinnerSourceSignals', () => {
    it('returns true when at least one occurredAt is in the past', () => {
      expect(
        hasPastWinnerSourceSignals(
          [{ occurredAt: pastIso }, { occurredAt: futureIso }],
          fixedNow,
        ),
      ).toBe(true);
    });

    it('returns false when sourceSignals empty or only future or missing occurredAt', () => {
      expect(hasPastWinnerSourceSignals(undefined, fixedNow)).toBe(false);
      expect(hasPastWinnerSourceSignals([], fixedNow)).toBe(false);
      expect(hasPastWinnerSourceSignals([{ occurredAt: futureIso }], fixedNow)).toBe(false);
      expect(hasPastWinnerSourceSignals([{ summary: 'x' }], fixedNow)).toBe(false);
    });
  });

  describe('needsNoThreadNoOutcomeBlock', () => {
    it('blocks when non-discrepancy, no goal, no thread', () => {
      expect(needsNoThreadNoOutcomeBlock('commitment', false, false)).toBe(true);
      expect(needsNoThreadNoOutcomeBlock('signal', false, false)).toBe(true);
    });

    it('does not block when there is a real thread', () => {
      expect(needsNoThreadNoOutcomeBlock('commitment', true, false)).toBe(false);
    });

    it('does not block when tied to outcome (matched goal)', () => {
      expect(needsNoThreadNoOutcomeBlock('commitment', false, true)).toBe(false);
    });

    it('never blocks discrepancy candidates (structural evidence)', () => {
      expect(needsNoThreadNoOutcomeBlock('discrepancy', false, false)).toBe(false);
      expect(needsNoThreadNoOutcomeBlock('discrepancy', false, true)).toBe(false);
    });
  });

  describe('getNewestEvidenceTimestampMs', () => {
    const oldIso = '2026-03-01T10:00:00.000Z';
    const midIso = '2026-04-02T10:00:00.000Z';

    it('returns 0 when both sides lack past timestamps', () => {
      expect(getNewestEvidenceTimestampMs(undefined, undefined, fixedNow)).toBe(0);
      expect(getNewestEvidenceTimestampMs([], [], fixedNow)).toBe(0);
    });

    it('prefers newer of supporting vs sourceSignals', () => {
      const ms = getNewestEvidenceTimestampMs(
        [{ occurred_at: midIso }],
        [{ occurredAt: oldIso }],
        fixedNow,
      );
      expect(ms).toBe(new Date(midIso).getTime());
    });

    it('uses supporting when sourceSignals are stale or empty', () => {
      const ms = getNewestEvidenceTimestampMs(
        [{ occurred_at: pastIso }],
        [{ occurredAt: oldIso }],
        fixedNow,
      );
      expect(ms).toBe(new Date(pastIso).getTime());
    });

    it('ignores future-dated rows on both sides', () => {
      expect(
        getNewestEvidenceTimestampMs([{ occurred_at: futureIso }], [{ occurredAt: futureIso }], fixedNow),
      ).toBe(0);
    });
  });

  describe('AZ-24 integration: empty supporting + past sourceSignals', () => {
    it('hasRealThread is true from winner refs alone (no hydrated snippets)', () => {
      const pastSignals = filterPastSupportingSignals([], fixedNow);
      const hasRealThread =
        pastSignals.length > 0 ||
        hasPastWinnerSourceSignals(
          [{ kind: 'signal', id: 's1', occurredAt: pastIso }],
          fixedNow,
        );
      expect(hasRealThread).toBe(true);
      expect(needsNoThreadNoOutcomeBlock('relationship', hasRealThread, false)).toBe(false);
    });

    it('regression: empty supporting and empty sourceSignals still no thread', () => {
      const pastSignals = filterPastSupportingSignals([], fixedNow);
      const hasRealThread =
        pastSignals.length > 0 || hasPastWinnerSourceSignals([], fixedNow);
      expect(hasRealThread).toBe(false);
      expect(needsNoThreadNoOutcomeBlock('commitment', hasRealThread, false)).toBe(true);
    });
  });
});
