import { describe, expect, it } from 'vitest';

import {
  DECISION_TRACE_GATE_FIXTURES,
  buildDecisionTraceGateReport,
  evaluateDecisionTrace,
  formatDecisionTraceGateReport,
  type QualityGateSummary,
  type ReleaseGateSummary,
  type VisualGateSummary,
} from '../decision-trace-gate-status';

const RELEASE_SUMMARY: ReleaseGateSummary = {
  gate: 'GATE_9_REAL_NON_OWNER_BETA',
  status: 'BLOCKED_EXTERNAL',
  reason: 'No real connected non-owner account exists.',
};

const QUALITY_SUMMARY: QualityGateSummary = {
  gate: 'QG_10_ARTIFACT_QUALITY',
  status: 'PASS',
  reason: 'Bad examples fail and good examples pass under executable QG_10 proof.',
};

const VISUAL_SUMMARY: VisualGateSummary = {
  gate: 'QG_11_VISUAL_FRONTEND_QUALITY',
  status: 'PASS',
  reason: 'Dashboard visual proof is passing.',
};

describe('decision trace gate status', () => {
  it('accepts every complete user-safe decision trace fixture', () => {
    const goodFixtures = DECISION_TRACE_GATE_FIXTURES.filter(
      (fixture) => fixture.expected === 'PASS',
    );

    expect(goodFixtures.map((fixture) => fixture.id)).toEqual([
      'good_no_safe_move',
      'good_one_source_backed_move',
      'good_rejected_generic_candidate',
      'good_rejected_stale_source_poor_candidate',
      'good_selected_deadline_reply_gap_decision_packet',
    ]);

    for (const fixture of goodFixtures) {
      const result = evaluateDecisionTrace(fixture);

      expect(result.passes, `${fixture.id}: ${result.reasons.join(',')}`).toBe(true);
      expect(result.reasons, fixture.id).toEqual([]);
    }
  });

  it('rejects bad traces that hide reasoning, leak private context, or expose unsafe internals', () => {
    const badFixtures = DECISION_TRACE_GATE_FIXTURES.filter(
      (fixture) => fixture.expected === 'FAIL',
    );

    expect(badFixtures.map((fixture) => fixture.id)).toEqual([
      'bad_artifact_without_candidate_explanation',
      'bad_because_ai_chose_it',
      'bad_source_trail_does_not_support_winner',
      'bad_rejected_candidates_hidden',
      'bad_no_why_now',
      'bad_raw_internal_scoring_terms',
      'bad_confidence_percentage_visible',
      'bad_private_owner_context_leaked',
    ]);

    for (const fixture of badFixtures) {
      const result = evaluateDecisionTrace(fixture);

      expect(result.passes, fixture.id).toBe(false);
      expect(result.reasons.length, fixture.id).toBeGreaterThan(0);
    }
  });

  it('reports QG_13 as passing only from deterministic decision-trace fixtures', () => {
    const report = buildDecisionTraceGateReport({
      releaseGate: RELEASE_SUMMARY,
      qualityGate: QUALITY_SUMMARY,
      visualGate: VISUAL_SUMMARY,
      fixtures: DECISION_TRACE_GATE_FIXTURES,
    });

    expect(report.decisionTraceGate.id).toBe('QG_13_DECISION_TRACE_QUALITY');
    expect(report.decisionTraceGate.status).toBe('PASS');
    expect(report.firstFailingDecisionTraceGate).toBeNull();
    expect(report.proofMissing).toEqual([]);
    expect(report.proofFound.join('\n')).toContain('8 bad decision trace fixtures rejected');
    expect(report.proofFound.join('\n')).toContain('5 good decision trace fixtures accepted');
    expect(report.proofFound.join('\n')).toContain('no paid generation');
  });

  it('fails when an expected-bad trace is allowed', () => {
    const report = buildDecisionTraceGateReport({
      releaseGate: RELEASE_SUMMARY,
      qualityGate: QUALITY_SUMMARY,
      visualGate: VISUAL_SUMMARY,
      fixtures: [
        ...DECISION_TRACE_GATE_FIXTURES.filter((fixture) => fixture.expected === 'PASS'),
        {
          ...DECISION_TRACE_GATE_FIXTURES.find(
            (fixture) => fixture.id === 'good_one_source_backed_move',
          )!,
          id: 'bad_but_accidentally_good',
          expected: 'FAIL' as const,
        },
      ],
    });

    expect(report.decisionTraceGate.status).toBe('FAIL');
    expect(report.firstFailingDecisionTraceGate?.id).toBe(
      'QG_13_DECISION_TRACE_QUALITY',
    );
    expect(report.proofMissing.join('\n')).toContain('bad_but_accidentally_good');
  });

  it('formats the required deterministic decision trace controller output', () => {
    const formatted = formatDecisionTraceGateReport(
      buildDecisionTraceGateReport({
        releaseGate: RELEASE_SUMMARY,
        qualityGate: QUALITY_SUMMARY,
        visualGate: VISUAL_SUMMARY,
        fixtures: DECISION_TRACE_GATE_FIXTURES,
      }),
    );

    expect(formatted).toContain('DECISION_TRACE_GATE: QG_13_DECISION_TRACE_QUALITY');
    expect(formatted).toContain('STATUS: PASS');
    expect(formatted).toContain('REASON:');
    expect(formatted).toContain('PROOF_FOUND:');
    expect(formatted).toContain('PROOF_MISSING:');
    expect(formatted).toContain('NEXT_MOVE:');
    expect(formatted).toContain('DO_NOT_TOUCH:');
    expect(formatted).toContain('FIXTURE_RESULTS:');
  });
});
