import { describe, expect, it } from 'vitest';

import {
  buildVisualGateReport,
  formatVisualGateReport,
  gatherVisualGateEvidence,
  type QualityGateSummary,
  type ReleaseGateSummary,
  type VisualGateEvidence,
} from '../visual-gate-status';

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

const COMPLETE_EVIDENCE: VisualGateEvidence = {
  currentMoveProof: [
    'tests/dashboard/live-artifact-pixel-lock.spec.ts asserts current move frame and finished artifact body are visible.',
  ],
  sourceTrailProof: [
    'tests/e2e/non-owner-beta-harness.spec.ts asserts dashboard source trail panel is visible and understandable.',
  ],
  approvalControlProof: [
    'tests/dashboard/live-artifact-pixel-lock.spec.ts asserts Save/Skip/Approve controls are visible and Approve & send is absent.',
  ],
  responsiveProof: [
    'tests/dashboard/live-artifact-pixel-lock.spec.ts asserts 390px mobile readability and no horizontal overflow.',
  ],
  screenshotProof: [
    'tests/e2e/landing-dashboard-visual.spec.ts captures dashboard desktop and mobile screenshots with overflow checks.',
  ],
  mockOnlyProof: [
    'Visual proof is deterministic mock/screenshot proof only; it is not real beta proof.',
  ],
};

describe('visual gate status', () => {
  it('passes QG_11 only when all executable visual proof categories exist', () => {
    const report = buildVisualGateReport({
      releaseGate: RELEASE_SUMMARY,
      qualityGate: QUALITY_SUMMARY,
      evidence: COMPLETE_EVIDENCE,
    });

    expect(report.releaseGate).toEqual(RELEASE_SUMMARY);
    expect(report.qualityGate).toEqual(QUALITY_SUMMARY);
    expect(report.visualGate.id).toBe('QG_11_VISUAL_FRONTEND_QUALITY');
    expect(report.visualGate.status).toBe('PASS');
    expect(report.firstFailingVisualGate).toBeNull();
    expect(report.proofMissing).toEqual([]);
    expect(report.proofFound.join('\n')).toContain('current move frame');
    expect(report.proofFound.join('\n')).toContain('source trail panel');
    expect(report.proofFound.join('\n')).toContain('dashboard desktop and mobile screenshots');
  });

  it('finds every QG_11 visual proof category in the current repo', () => {
    const evidence = gatherVisualGateEvidence(process.cwd());

    expect(evidence.currentMoveProof).toHaveLength(1);
    expect(evidence.sourceTrailProof).toHaveLength(1);
    expect(evidence.approvalControlProof).toHaveLength(1);
    expect(evidence.responsiveProof).toHaveLength(1);
    expect(evidence.screenshotProof).toHaveLength(1);
    expect(evidence.mockOnlyProof).toHaveLength(1);
  });

  it('fails QG_11 when screenshot proof is missing', () => {
    const report = buildVisualGateReport({
      releaseGate: RELEASE_SUMMARY,
      qualityGate: QUALITY_SUMMARY,
      evidence: {
        ...COMPLETE_EVIDENCE,
        screenshotProof: [],
      },
    });

    expect(report.visualGate.status).toBe('FAIL');
    expect(report.firstFailingVisualGate?.id).toBe('QG_11_VISUAL_FRONTEND_QUALITY');
    expect(report.proofMissing).toContain(
      'Dashboard desktop/mobile screenshot proof must exist and include overflow checks.',
    );
  });

  it('blocks QG_11 when QG_10 is not passing', () => {
    const report = buildVisualGateReport({
      releaseGate: RELEASE_SUMMARY,
      qualityGate: {
        gate: 'QG_10_ARTIFACT_QUALITY',
        status: 'FAIL',
        reason: 'QG_10 fixture proof failed.',
      },
      evidence: COMPLETE_EVIDENCE,
    });

    expect(report.visualGate.status).toBe('UNKNOWN');
    expect(report.proofMissing).toContain(
      'QG_10_ARTIFACT_QUALITY must pass before QG_11 can be treated as current.',
    );
  });

  it('formats the deterministic visual-controller report', () => {
    const formatted = formatVisualGateReport(
      buildVisualGateReport({
        releaseGate: RELEASE_SUMMARY,
        qualityGate: QUALITY_SUMMARY,
        evidence: COMPLETE_EVIDENCE,
      }),
    );

    expect(formatted).toContain('RELEASE_GATE: GATE_9_REAL_NON_OWNER_BETA - BLOCKED_EXTERNAL');
    expect(formatted).toContain('QUALITY_GATE: QG_10_ARTIFACT_QUALITY - PASS');
    expect(formatted).toContain('VISUAL_GATE: QG_11_VISUAL_FRONTEND_QUALITY');
    expect(formatted).toContain('FIRST_FAILING_VISUAL_GATE: NONE');
    expect(formatted).toContain('STATUS: PASS');
    expect(formatted).toContain('PROOF_FOUND:');
    expect(formatted).toContain('PROOF_MISSING:');
    expect(formatted).toContain(
      'DO_NOT_TOUCH: UI polish, Stripe, paid generation, fake users, owner-only proof, pricing.',
    );
  });
});
