import { describe, it, expect } from 'vitest';
import { highConsequenceStakesFloor, overdueAdmissionWindowDays } from '../scorer';

/**
 * Master Audit #445 — gem-surfacing.
 *
 * Live forensic pass (read-only) found the engine emits "Nothing cleared the bar
 * today after evaluating N candidates" while real high-consequence commitments sit
 * in the admitted pool. Root cause: scorer stakes were derived almost entirely from
 * goal-match priority (`6 - priority`), defaulting to 1.0 with no goal match — so a
 * genuine gem (a lapsing Rule 59(e) court motion, a job-offer response, a hardship
 * payment plan) got stakes 1.0 and was zeroed by the decision-moving (stakes ≥ 2)
 * and lifecycle (stakes < 2 → archive_only) gates. The commitment's own risk_score
 * (already used to ORDER the pool, then discarded) is the fix.
 *
 * These risk_score values are the actual live winners that were being dropped.
 */
describe('highConsequenceStakesFloor', () => {
  it('lifts real high-consequence gems off the stakes-1.0 floor', () => {
    // Real live rows (unclassified/trusted, admitted, scored to ~0 before the fix):
    expect(highConsequenceStakesFloor('commitment', 91, 1.0)).toBe(4); // declined $346.61 transaction
    expect(highConsequenceStakesFloor('commitment', 85, 1.0)).toBe(4); // hardship waiver / overpayment
    expect(highConsequenceStakesFloor('commitment', 68, 1.0)).toBe(3); // "Inform Jacob Santoyo of job offer acceptance"
    expect(highConsequenceStakesFloor('commitment', 66, 1.0)).toBe(3); // "Send filings + case summary to counsel"
    // All clear the decision-moving (≥2) and lifecycle (≥2) gates that previously zeroed them.
    expect(highConsequenceStakesFloor('commitment', 91, 1.0)).toBeGreaterThanOrEqual(2);
  });

  it('maps risk_score bands deterministically', () => {
    expect(highConsequenceStakesFloor('commitment', 80, 1.0)).toBe(4);
    expect(highConsequenceStakesFloor('commitment', 79, 1.0)).toBe(3);
    expect(highConsequenceStakesFloor('commitment', 60, 1.0)).toBe(3);
    expect(highConsequenceStakesFloor('commitment', 59, 1.0)).toBe(2);
    expect(highConsequenceStakesFloor('commitment', 40, 1.0)).toBe(2);
    expect(highConsequenceStakesFloor('commitment', 39, 1.0)).toBe(1); // below floor → base (1.0 rounded by Math.max)
  });

  it('is lift-only — never lowers goal-derived stakes', () => {
    // A P1 goal-matched commitment already has stakes 5; a modest risk_score must not pull it down.
    expect(highConsequenceStakesFloor('commitment', 60, 5)).toBe(5);
    expect(highConsequenceStakesFloor('commitment', 40, 4)).toBe(4);
    expect(highConsequenceStakesFloor('commitment', 95, 3)).toBe(4); // but still lifts when risk says higher
  });

  it('is inert for non-commitments (signals/relationships keep their stakes)', () => {
    expect(highConsequenceStakesFloor('signal', 95, 1.0)).toBe(1.0);
    expect(highConsequenceStakesFloor('relationship', 90, 2.5)).toBe(2.5);
  });

  it('is inert when risk_score is missing or invalid (no regression for fixtures without it)', () => {
    expect(highConsequenceStakesFloor('commitment', null, 1.0)).toBe(1.0);
    expect(highConsequenceStakesFloor('commitment', undefined, 1.0)).toBe(1.0);
    expect(highConsequenceStakesFloor('commitment', Number.NaN, 1.0)).toBe(1.0);
  });
});

/**
 * The scorer drops commitments overdue by more than the admission window before
 * scoring. A 30-day blanket cutoff silently dropped the real job-offer gem (due
 * 2026-05-15, ~5 weeks overdue). High-consequence (risk_score ≥ 60) active rows get
 * a 60-day window so they survive to scoring; the soft staleness penalty still
 * discounts them at ranking time.
 */
describe('overdueAdmissionWindowDays', () => {
  it('extends the window to 60 days for high-consequence (risk ≥ 60) commitments', () => {
    expect(overdueAdmissionWindowDays(68)).toBe(60); // the job-offer gem survives 35d overdue
    expect(overdueAdmissionWindowDays(91)).toBe(60); // declined $346.61 transaction
    expect(overdueAdmissionWindowDays(60)).toBe(60); // band edge
  });

  it('keeps the 30-day cutoff for low/moderate-risk and missing risk_score', () => {
    expect(overdueAdmissionWindowDays(59)).toBe(30);
    expect(overdueAdmissionWindowDays(20)).toBe(30);
    expect(overdueAdmissionWindowDays(null)).toBe(30);
    expect(overdueAdmissionWindowDays(undefined)).toBe(30);
    expect(overdueAdmissionWindowDays(Number.NaN)).toBe(30);
  });
});
