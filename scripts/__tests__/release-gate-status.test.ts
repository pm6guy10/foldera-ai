import { describe, expect, it } from 'vitest';

import {
  buildReleaseGateReport,
  formatReleaseGateReport,
  type ReleaseGateEvidence,
} from '../release-gate-status';

const BASE_EVIDENCE: ReleaseGateEvidence = {
  gitMainSha: 'c939e296ce12c29acc87bd1fde6f7d0c2fa59c88',
  productionSha: 'c939e296ce12c29acc87bd1fde6f7d0c2fa59c88',
  healthSha: 'c939e296ce12c29acc87bd1fde6f7d0c2fa59c88',
  activeHandoffSha: 'c939e296ce12c29acc87bd1fde6f7d0c2fa59c88',
  activeHandoffText:
    'Current release gate: GATE_9_REAL_NON_OWNER_BETA\nFirst failing release gate: GATE_9_REAL_NON_OWNER_BETA\nLast known production SHA: c939e296ce12c29acc87bd1fde6f7d0c2fa59c88',
  publicBoundaryProof: [
    'tests/e2e/public-routes.spec.ts asserts landing demo has no Brandon copy',
    'lib/demo/demo-data.ts uses fictional public demo examples',
  ],
  authOnboardingProof: [
    'tests/e2e/non-owner-beta-harness.spec.ts covers /start and no-token onboarding',
  ],
  sourceStatusProof: [
    'NON_OWNER_BETA_HARNESS_MAP.md maps no/stale/connected/fresh source states',
    'tests/e2e/non-owner-beta-harness.spec.ts covers no-token, connected, no-safe-move, source-backed states',
  ],
  selectionProof: [
    'lib/cron/acceptance-gate.ts excludes OWNER_USER_ID and TEST_USER_ID from NON_OWNER_DEPTH',
  ],
  artifactProof: [
    'tests/e2e/non-owner-beta-harness.spec.ts covers source-backed move and no-safe-move',
  ],
  sourceTrailProof: [
    'tests/e2e/non-owner-beta-harness.spec.ts covers product source trail rendering',
  ],
  approvalHistoryProof: [
    'tests/e2e/non-owner-beta-harness.spec.ts covers Save/Skip/Approve/history with no outbound send',
  ],
  nonOwnerHarnessProof: [
    'NON_OWNER_BETA_HARNESS_MAP.md labels mock harness as mock only',
    'tests/e2e/non-owner-beta-harness.spec.ts uses non-owner reserved-safe harness identity',
  ],
  realNonOwnerProof: [],
  ownerAndTestExclusionProof: [
    'lib/cron/acceptance-gate.ts has .neq("user_id", OWNER_USER_ID)',
    'lib/cron/acceptance-gate.ts has .neq("user_id", TEST_USER_ID)',
  ],
};

describe('release gate status', () => {
  it('reports GATE_9 as the first failing gate when all local/mock gates pass but real non-owner proof is absent', () => {
    const report = buildReleaseGateReport(BASE_EVIDENCE);

    expect(report.currentGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(report.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(report.firstFailingGate.status).toBe('BLOCKED_EXTERNAL');
    expect(report.firstFailingGate.reason).toBe('No real connected non-owner account exists.');
    expect(report.firstFailingGate.nextMove).toBe(
      'Get one real tester to connect Google or Microsoft.',
    );
    expect(report.firstFailingGate.doNotTouch).toContain('paid generation');
  });

  it('formats the deterministic release-controller summary lines', () => {
    const formatted = formatReleaseGateReport(buildReleaseGateReport(BASE_EVIDENCE));

    expect(formatted).toContain('CURRENT_GATE: GATE_9_REAL_NON_OWNER_BETA');
    expect(formatted).toContain('FIRST_FAILING_GATE: GATE_9_REAL_NON_OWNER_BETA');
    expect(formatted).toContain('STATUS: BLOCKED_EXTERNAL');
    expect(formatted).toContain('REASON: No real connected non-owner account exists.');
    expect(formatted).toContain('NEXT_MOVE: Get one real tester to connect Google or Microsoft.');
    expect(formatted).toContain(
      'DO_NOT_TOUCH: UI polish, Stripe, paid generation, owner-only proof, fake users.',
    );
  });

  it('fails GATE_0 before later gates when handoff production truth is stale', () => {
    const report = buildReleaseGateReport({
      ...BASE_EVIDENCE,
      activeHandoffSha: 'cc67c233b76ab1dac4884bbd68229cc21dacdf8c',
      activeHandoffText: 'Last known production SHA: cc67c233b76ab1dac4884bbd68229cc21dacdf8c',
    });

    expect(report.firstFailingGate.id).toBe('GATE_0_LIVE_TRUTH');
    expect(report.firstFailingGate.status).toBe('FAIL');
    expect(report.firstFailingGate.proofMissing).toContain(
      'ACTIVE_HANDOFF.md must match current production truth for SHA c939e296ce12c29acc87bd1fde6f7d0c2fa59c88',
    );
  });

  it('does not treat a newer GitHub/main SHA as the first failing gate when production health and handoff agree', () => {
    const report = buildReleaseGateReport({
      ...BASE_EVIDENCE,
      gitMainSha: '7b129f4e11111111111111111111111111111111',
    });

    expect(report.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(report.gates[0]?.status).toBe('PASS');
    expect(report.gates[0]?.proofFound.join('\n')).toContain(
      'GitHub/main differs from current production',
    );
  });

  it('does not fail live truth when the handoff gate/status is current but its recorded production SHA is from a prior receipt', () => {
    const report = buildReleaseGateReport({
      ...BASE_EVIDENCE,
      productionSha: 'b67600e55bfe6dbb1fe5bb318b99d5a524745edf',
      healthSha: 'b67600e55bfe6dbb1fe5bb318b99d5a524745edf',
      activeHandoffSha: '6b0c163564a8646075ef904c1f82a2ff441c7a36',
      activeHandoffText:
        'Current release gate: GATE_9_REAL_NON_OWNER_BETA\nFirst failing release gate: GATE_9_REAL_NON_OWNER_BETA\nRelease gate status: BLOCKED_EXTERNAL\nLast known production SHA: 6b0c163',
    });

    expect(report.gates[0]?.status).toBe('PASS');
    expect(report.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(report.gates[0]?.proofFound.join('\n')).toContain(
      'ACTIVE_HANDOFF.md release gate/status matches current release truth',
    );
  });
});
