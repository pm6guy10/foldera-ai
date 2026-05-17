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
    'lib/cron/acceptance-gate.ts excludes OWNER_USER_ID, TEST_USER_ID, and OWNER_CANARY_USER_IDS from NON_OWNER_DEPTH',
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
  internalOwnerAliasProof: [],
  ownerAndTestExclusionProof: [
    'lib/cron/acceptance-gate.ts has .neq("user_id", OWNER_USER_ID)',
    'lib/cron/acceptance-gate.ts has .neq("user_id", TEST_USER_ID)',
    'lib/cron/acceptance-gate.ts excludes OWNER_CANARY_USER_IDS',
  ],
};

const PRE_BETA_PROOF_LINES = [
  '- deployed pre-beta readiness proof: a new tester can connect Google or Microsoft and reach one honest Today answer.',
  '- Today answer is governed by source coverage; thin graphs show Fix this first; earned clear state requires sufficient coverage.',
  '- Source trail, no-send boundary, Save/Skip/Approve/history, and Next unlock remain intact.',
  '- tester-facing expectation: Foldera may show Do this, You’re clear right now, or Fix this first.',
];

function withPreBetaProof(
  evidence: ReleaseGateEvidence = BASE_EVIDENCE,
): ReleaseGateEvidence {
  return {
    ...evidence,
    activeHandoffText: [evidence.activeHandoffText, ...PRE_BETA_PROOF_LINES].join('\n'),
  };
}

describe('release gate status', () => {
  it('stops at PRE_BETA_READINESS_THRESHOLD before asking for external beta when deployed first-run readiness is not proven', () => {
    const report = buildReleaseGateReport(BASE_EVIDENCE);

    expect(report.currentGate.id).toBe('PRE_BETA_READINESS_THRESHOLD');
    expect(report.firstFailingGate.id).toBe('PRE_BETA_READINESS_THRESHOLD');
    expect(report.firstFailingGate.status).toBe('BLOCKED_EXTERNAL');
    expect(report.firstFailingGate.reason).toBe(
      'Deployed first-run readiness is not yet proven for external testers.',
    );
    expect(report.firstFailingGate.nextMove).toBe(
      'Prove the deployed first-run path is stable, honest, and tester-safe before routing to external beta.',
    );
  });

  it('passes PRE_BETA_READINESS_THRESHOLD only from deployed tester-safe proof, not internal owner-alias proof', () => {
    const ownerAliasOnly = buildReleaseGateReport({
      ...BASE_EVIDENCE,
      activeHandoffText: [
        BASE_EVIDENCE.activeHandoffText,
        '- micro1 is Brandon-controlled and is internal owner-alias proof only.',
        '- owner-alias pre-beta readiness proof: deployed first-run path is stable, honest, and tester-safe.',
      ].join('\n'),
    });
    const deployedProof = buildReleaseGateReport(withPreBetaProof());

    expect(ownerAliasOnly.firstFailingGate.id).toBe('PRE_BETA_READINESS_THRESHOLD');
    expect(deployedProof.gates.find((gate) => gate.id === 'PRE_BETA_READINESS_THRESHOLD')?.status).toBe(
      'PASS',
    );
    expect(deployedProof.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
  });

  it('reports GATE_9A as the first failing gate when all local/mock gates pass but real non-owner proof is absent', () => {
    const report = buildReleaseGateReport(withPreBetaProof());

    expect(report.currentGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(report.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(report.firstFailingGate.status).toBe('BLOCKED_EXTERNAL');
    expect(report.firstFailingGate.reason).toBe(
      'Current handoff is missing real non-owner connection proof.',
    );
    expect(report.firstFailingGate.nextMove).toBe(
      'Get one real non-owner tester account with connected Google or Microsoft before evaluating first-run activation.',
    );
    expect(report.firstFailingGate.doNotTouch).toContain('paid generation');
  });

  it('formats the deterministic release-controller summary lines', () => {
    const formatted = formatReleaseGateReport(
      buildReleaseGateReport(withPreBetaProof()),
    );

    expect(formatted).toContain('CURRENT_GATE: GATE_9A_FIRST_RUN_ACTIVATION');
    expect(formatted).toContain('FIRST_FAILING_GATE: GATE_9A_FIRST_RUN_ACTIVATION');
    expect(formatted).toContain('STATUS: BLOCKED_EXTERNAL');
    expect(formatted).toContain(
      'REASON: Current handoff is missing real non-owner connection proof.',
    );
    expect(formatted).toContain(
      'NEXT_MOVE: Get one real non-owner tester account with connected Google or Microsoft before evaluating first-run activation.',
    );
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
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      gitMainSha: '7b129f4e11111111111111111111111111111111',
    }));

    expect(report.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(report.gates[0]?.status).toBe('PASS');
    expect(report.gates[0]?.proofFound.join('\n')).toContain(
      'GitHub/main differs from current production',
    );
  });

  it('does not fail live truth when the handoff gate/status is current but its recorded production SHA is from a prior receipt', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      productionSha: 'b67600e55bfe6dbb1fe5bb318b99d5a524745edf',
      healthSha: 'b67600e55bfe6dbb1fe5bb318b99d5a524745edf',
      activeHandoffSha: '6b0c163564a8646075ef904c1f82a2ff441c7a36',
      activeHandoffText:
        'Current release gate: GATE_9_REAL_NON_OWNER_BETA\nFirst failing release gate: GATE_9_REAL_NON_OWNER_BETA\nRelease gate status: BLOCKED_EXTERNAL\nLast known production SHA: 6b0c163',
    }));

    expect(report.gates[0]?.status).toBe('PASS');
    expect(report.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(report.gates[0]?.proofFound.join('\n')).toContain(
      'ACTIVE_HANDOFF.md release gate/status matches current release truth',
    );
  });

  it('does not fail live truth when first-run activation is recorded from a prior production receipt', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      productionSha: 'b67600e55bfe6dbb1fe5bb318b99d5a524745edf',
      healthSha: 'b67600e55bfe6dbb1fe5bb318b99d5a524745edf',
      activeHandoffSha: '6b0c163564a8646075ef904c1f82a2ff441c7a36',
      activeHandoffText:
        'Current release gate: GATE_9A_FIRST_RUN_ACTIVATION\nFirst failing release gate: GATE_9_REAL_NON_OWNER_BETA\nRelease gate status: WAITING_FULL_BETA\nLast known production SHA: 6b0c163',
      realNonOwnerProof: [
        'real non-owner first-run state: connected source Google; signal_count=1; processed_signal_count=0; unprocessed_signal_count=1; reason=not enough evidence; next_action=Check sources now; nothing_sent=true',
      ],
    }));

    expect(report.gates[0]?.status).toBe('PASS');
    expect(report.gates.find((gate) => gate.id === 'GATE_9A_FIRST_RUN_ACTIVATION')?.status).toBe(
      'PASS',
    );
    expect(report.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(report.firstFailingGate.status).toBe('BLOCKED_EXTERNAL');
    expect(report.firstFailingGate.reason).toContain('Full beta proof still requires');
  });

  it('fails selection proof when owner canary user ids are not excluded from real beta proof', () => {
    const report = buildReleaseGateReport({
      ...BASE_EVIDENCE,
      ownerAndTestExclusionProof: [
        'lib/cron/acceptance-gate.ts has .neq("user_id", OWNER_USER_ID)',
        'lib/cron/acceptance-gate.ts has .neq("user_id", TEST_USER_ID)',
      ],
    });

    expect(report.firstFailingGate.id).toBe('GATE_4_SELECTION');
    expect(report.firstFailingGate.status).toBe('FAIL');
    expect(report.firstFailingGate.proofMissing).toContain(
      'OWNER_USER_ID, TEST_USER_ID, and OWNER_CANARY_USER_IDS exclusion proof missing',
    );
  });

  it('does not pass GATE_9A from token-only, welcome-only, or unprocessed-signal-only proof', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner token exists for google',
        'welcome email sent to real non-owner',
        'one gmail signal exists but processed=false',
      ],
    }));

    expect(report.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(report.firstFailingGate.status).toBe('BLOCKED_EXTERNAL');
    expect(report.firstFailingGate.reason).toContain('first-run value proof is incomplete');
    expect(report.firstFailingGate.proofMissing).toContain(
      'Real non-owner must reach a clear first-run state with source counts, reason, and next action, or a source-backed move.',
    );
  });

  it('passes GATE_9A from a clear low-data first-run state without calling it full beta success', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner first-run state: connected source Google; signal_count=1; processed_signal_count=0; unprocessed_signal_count=1; reason=not enough evidence; next_action=Check sources now; nothing_sent=true',
      ],
    }));

    expect(report.gates.find((gate) => gate.id === 'GATE_9A_FIRST_RUN_ACTIVATION')?.status).toBe(
      'PASS',
    );
    expect(report.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(report.firstFailingGate.status).toBe('BLOCKED_EXTERNAL');
    expect(report.firstFailingGate.nextMove).toBe(
      'Get one real non-owner tester account with connected Google or Microsoft and either a source-backed action or explicit tester feedback.',
    );
    const formatted = formatReleaseGateReport(report);
    expect(formatted).not.toContain('Get one real tester');
    expect(formatted).not.toContain('No real connected non-owner account exists');
  });

  it('does not treat micro1 owner-alias proof as real non-owner beta proof', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner first-run state (micro1): connected source Google; signal_count=6; processed_signal_count=6; unprocessed_signal_count=0; reason=no safe move yet; next_action=wait for stronger evidence; nothing_sent=true',
      ],
      internalOwnerAliasProof: [
        'owner-alias first-run state (micro1): connected source Google; signal_count=6; processed_signal_count=6; unprocessed_signal_count=0; reason=no safe move yet; next_action=wait for stronger evidence; nothing_sent=true',
      ],
    }));

    expect(report.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(formatReleaseGateReport(report)).toContain(
      'micro1/owner-alias proof is internal only',
    );
  });

  it('does not pass full GATE_9 from micro1 explicit feedback or Brandon-controlled alias proof', () => {
    const micro1FeedbackReport = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'explicit tester feedback: real non-owner tester micro1 said the waiting state was understandable and useful enough to keep trusting Foldera.',
      ],
      internalOwnerAliasProof: [
        'explicit tester feedback: owner-alias tester micro1 said the waiting state was understandable and useful enough to keep trusting Foldera.',
      ],
    }));
    const ownerAliasActionReport = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner source-backed move: Brandon-controlled alias; source trail visible; save/skip/approve/history controls visible; next_action=Save the verified move.',
      ],
      internalOwnerAliasProof: [
        'owner-alias source-backed move (micro1): source trail visible; save/skip/approve/history controls visible; next_action=Save the verified move.',
      ],
    }));

    expect(micro1FeedbackReport.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
    expect(ownerAliasActionReport.firstFailingGate.id).toBe('GATE_9A_FIRST_RUN_ACTIVATION');
  });

  it('passes full GATE_9 from explicit real non-owner tester feedback about the waiting state', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner first-run state: connected source Google; signal_count=6; processed_signal_count=6; unprocessed_signal_count=0; reason=no safe move yet; next_action=wait for stronger evidence; nothing_sent=true',
        'explicit tester feedback: real non-owner tester said the waiting state was understandable and useful enough to keep trusting Foldera.',
      ],
    }));

    expect(report.gates.find((gate) => gate.id === 'GATE_9A_FIRST_RUN_ACTIVATION')?.status).toBe(
      'PASS',
    );
    expect(report.gates.find((gate) => gate.id === 'GATE_9_REAL_NON_OWNER_BETA')?.status).toBe(
      'PASS',
    );
    expect(report.firstFailingGate.status).toBe('PASS');
  });

  it('passes full GATE_9 from a real non-owner source-backed action path', () => {
    const report = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner source-backed move: source trail visible; save/skip/approve/history controls visible; next_action=Save the verified move.',
      ],
    }));

    expect(report.gates.find((gate) => gate.id === 'GATE_9A_FIRST_RUN_ACTIVATION')?.status).toBe(
      'PASS',
    );
    expect(report.gates.find((gate) => gate.id === 'GATE_9_REAL_NON_OWNER_BETA')?.status).toBe(
      'PASS',
    );
  });

  it('does not pass full GATE_9 from fake, owner, or reserved-test feedback claims', () => {
    const fakeFeedbackReport = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner first-run state: connected source Google; signal_count=6; processed_signal_count=6; unprocessed_signal_count=0; reason=no safe move yet; next_action=wait for stronger evidence; nothing_sent=true',
        'explicit tester feedback: synthetic fixture said the waiting state was understandable and useful enough to keep trusting Foldera.',
      ],
    }));
    const ownerFeedbackReport = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner first-run state: connected source Google; signal_count=6; processed_signal_count=6; unprocessed_signal_count=0; reason=no safe move yet; next_action=wait for stronger evidence; nothing_sent=true',
        'explicit tester feedback: OWNER_USER_ID said the waiting state was understandable and useful enough to keep trusting Foldera.',
      ],
    }));
    const testUserFeedbackReport = buildReleaseGateReport(withPreBetaProof({
      ...BASE_EVIDENCE,
      realNonOwnerProof: [
        'real non-owner first-run state: connected source Google; signal_count=6; processed_signal_count=6; unprocessed_signal_count=0; reason=no safe move yet; next_action=wait for stronger evidence; nothing_sent=true',
        'explicit tester feedback: TEST_USER_ID said the waiting state was understandable and useful enough to keep trusting Foldera.',
      ],
    }));

    expect(fakeFeedbackReport.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(ownerFeedbackReport.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
    expect(testUserFeedbackReport.firstFailingGate.id).toBe('GATE_9_REAL_NON_OWNER_BETA');
  });
});



