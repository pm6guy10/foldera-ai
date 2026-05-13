import { describe, expect, it } from 'vitest';

import {
  QUALITY_GATE_FIXTURES,
  buildQualityGateReport,
  evaluateQG10Artifact,
  formatQualityGateReport,
  type ReleaseGateSummary,
} from '../quality-gate-status';

const RELEASE_SUMMARY: ReleaseGateSummary = {
  gate: 'GATE_9_REAL_NON_OWNER_BETA',
  status: 'BLOCKED_EXTERNAL',
  reason: 'No real connected non-owner account exists.',
};

describe('quality gate status', () => {
  it('rejects every low-value QG_10 artifact fixture', () => {
    const badFixtures = QUALITY_GATE_FIXTURES.filter((fixture) => fixture.expected === 'FAIL');

    expect(badFixtures.length).toBeGreaterThanOrEqual(12);
    for (const fixture of badFixtures) {
      const result = evaluateQG10Artifact(fixture);

      expect(result.passes, `${fixture.id}: ${result.reasons.join(',')}`).toBe(false);
      expect(result.reasons.length, fixture.id).toBeGreaterThan(0);
    }
  });

  it('accepts every source-backed action-ready QG_10 artifact fixture', () => {
    const goodFixtures = QUALITY_GATE_FIXTURES.filter((fixture) => fixture.expected === 'PASS');

    expect(goodFixtures.length).toBeGreaterThanOrEqual(7);
    for (const fixture of goodFixtures) {
      const result = evaluateQG10Artifact(fixture);

      expect(result.passes, `${fixture.id}: ${result.reasons.join(',')}`).toBe(true);
      expect(result.reasons, fixture.id).toEqual([]);
    }
  });

  it('reports QG_10 as passing only from executable fixture proof', () => {
    const report = buildQualityGateReport({
      releaseGate: RELEASE_SUMMARY,
      fixtures: QUALITY_GATE_FIXTURES,
    });

    expect(report.releaseGate).toEqual(RELEASE_SUMMARY);
    expect(report.qualityGate.id).toBe('QG_10_ARTIFACT_QUALITY');
    expect(report.qualityGate.status).toBe('PASS');
    expect(report.firstFailingQualityGate).toBeNull();
    expect(report.proofFound.join('\n')).toContain('bad artifact fixtures rejected');
    expect(report.proofFound.join('\n')).toContain('good artifact fixtures accepted');
    expect(report.proofMissing).toEqual([]);
  });

  it('fails QG_10 when an expected-bad fixture is allowed', () => {
    const report = buildQualityGateReport({
      releaseGate: RELEASE_SUMMARY,
      fixtures: [
        ...QUALITY_GATE_FIXTURES.filter((fixture) => fixture.expected === 'PASS'),
        {
          id: 'bad_but_accidentally_good',
          expected: 'FAIL' as const,
          title: 'Deadline packet with source evidence',
          artifact: [
            'Source Email: vendor asks for contract choice by Friday.',
            'Why now: the renewal window closes Friday.',
            'FINAL RECOMMENDATION: approve the lower-risk renewal.',
            'NEXT ACTION: send the approval reply today.',
            'Source trail: vendor renewal email and calendar hold.',
          ].join('\n'),
          sourceFacts: ['Source Email: vendor asks for contract choice by Friday.'],
        },
      ],
    });

    expect(report.qualityGate.status).toBe('FAIL');
    expect(report.firstFailingQualityGate?.id).toBe('QG_10_ARTIFACT_QUALITY');
    expect(report.proofMissing.join('\n')).toContain('bad_but_accidentally_good');
  });

  it('formats the deterministic quality-controller report', () => {
    const formatted = formatQualityGateReport(
      buildQualityGateReport({
        releaseGate: RELEASE_SUMMARY,
        fixtures: QUALITY_GATE_FIXTURES,
      }),
    );

    expect(formatted).toContain('RELEASE_GATE: GATE_9_REAL_NON_OWNER_BETA - BLOCKED_EXTERNAL');
    expect(formatted).toContain('QUALITY_GATE: QG_10_ARTIFACT_QUALITY');
    expect(formatted).toContain('FIRST_FAILING_QUALITY_GATE: NONE');
    expect(formatted).toContain('STATUS: PASS');
    expect(formatted).toContain('PROOF_FOUND:');
    expect(formatted).toContain('PROOF_MISSING:');
    expect(formatted).toContain(
      'DO_NOT_TOUCH: UI polish, Stripe, paid generation, fake users, owner-only proof, pricing.',
    );
  });
});
