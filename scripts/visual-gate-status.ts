import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildQualityGateReport,
  type QualityGateStatus,
  type ReleaseGateSummary,
} from './quality-gate-status';
import {
  buildReleaseGateReport,
  gatherReleaseGateEvidence,
  type ReleaseGateStatus,
} from './release-gate-status';

export type { ReleaseGateSummary } from './quality-gate-status';

export type VisualGateStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface QualityGateSummary {
  gate: string;
  status: QualityGateStatus | 'UNKNOWN';
  reason: string;
}

export interface VisualGateEvidence {
  currentMoveProof: string[];
  sourceTrailProof: string[];
  approvalControlProof: string[];
  responsiveProof: string[];
  screenshotProof: string[];
  mockOnlyProof: string[];
}

export interface VisualGateResult {
  id: 'QG_11_VISUAL_FRONTEND_QUALITY';
  status: VisualGateStatus;
  reason: string;
  nextMove: string;
  doNotTouch: string;
}

export interface VisualGateReport {
  releaseGate: ReleaseGateSummary;
  qualityGate: QualityGateSummary;
  visualGate: VisualGateResult;
  firstFailingVisualGate: VisualGateResult | null;
  proofFound: string[];
  proofMissing: string[];
}

const DO_NOT_TOUCH =
  'UI polish, Stripe, paid generation, fake users, owner-only proof, pricing.';

const QG_11_ID = 'QG_11_VISUAL_FRONTEND_QUALITY' as const;

function proofIf(condition: boolean, proof: string): string[] {
  return condition ? [proof] : [];
}

function hasAll(text: string, needles: string[]): boolean {
  return needles.every((needle) => text.includes(needle));
}

function hasRegexAll(text: string, patterns: RegExp[]): boolean {
  return patterns.every((pattern) => pattern.test(text));
}

function readIfExists(repoRoot: string, relativePath: string): string {
  const path = resolve(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

export function buildVisualGateReport(input: {
  releaseGate?: ReleaseGateSummary;
  qualityGate?: QualityGateSummary;
  evidence: VisualGateEvidence;
}): VisualGateReport {
  const releaseGate = input.releaseGate ?? {
    gate: 'UNKNOWN',
    status: 'UNKNOWN' as ReleaseGateStatus | 'UNKNOWN',
    reason: 'Release gate status unavailable.',
  };
  const qualityGate = input.qualityGate ?? {
    gate: 'UNKNOWN',
    status: 'UNKNOWN' as const,
    reason: 'Quality gate status unavailable.',
  };
  const proofFound: string[] = [];
  const proofMissing: string[] = [];

  if (qualityGate.gate !== 'QG_10_ARTIFACT_QUALITY' || qualityGate.status !== 'PASS') {
    proofMissing.push('QG_10_ARTIFACT_QUALITY must pass before QG_11 can be treated as current.');
  } else {
    proofFound.push('QG_10_ARTIFACT_QUALITY is PASS before visual quality is evaluated.');
  }

  const requiredProof = [
    {
      found: input.evidence.currentMoveProof,
      missing: 'Current move and finished artifact must be mechanically visible on dashboard.',
    },
    {
      found: input.evidence.sourceTrailProof,
      missing: 'Source trail must be mechanically visible and understandable.',
    },
    {
      found: input.evidence.approvalControlProof,
      missing: 'Approval controls must be visible and safe, with no implicit send.',
    },
    {
      found: input.evidence.responsiveProof,
      missing: 'Desktop/mobile layout proof must include no-overflow checks.',
    },
    {
      found: input.evidence.screenshotProof,
      missing: 'Dashboard desktop/mobile screenshot proof must exist and include overflow checks.',
    },
    {
      found: input.evidence.mockOnlyProof,
      missing: 'Visual proof must be labeled mock-only and must not claim beta proof.',
    },
  ];

  for (const proof of requiredProof) {
    if (proof.found.length > 0) proofFound.push(...proof.found);
    else proofMissing.push(proof.missing);
  }

  proofFound.push(
    'Visual gate proof is deterministic local/browser proof only; no paid generation, outbound email, Stripe, schema, fake users, or owner-only beta proof required.',
  );

  const status: VisualGateStatus =
    proofMissing.length === 0
      ? 'PASS'
      : proofMissing.some((missing) => missing.includes('QG_10_ARTIFACT_QUALITY'))
        ? 'UNKNOWN'
        : 'FAIL';
  const visualGate: VisualGateResult = {
    id: QG_11_ID,
    status,
    reason:
      status === 'PASS'
        ? 'Dashboard current move, source trail, approval controls, responsive layout, and screenshots have executable visual proof.'
        : status === 'UNKNOWN'
          ? 'Visual gate cannot pass until the prior quality gate is passing.'
          : 'Executable visual proof is incomplete.',
    nextMove:
      status === 'PASS'
        ? 'Keep QG_11 green; do not start UI polish or pricing work without a new gate scope.'
        : 'Fix QG_11_VISUAL_FRONTEND_QUALITY proof only.',
    doNotTouch: DO_NOT_TOUCH,
  };

  return {
    releaseGate,
    qualityGate,
    visualGate,
    firstFailingVisualGate: status === 'PASS' ? null : visualGate,
    proofFound,
    proofMissing,
  };
}

export function formatVisualGateReport(report: VisualGateReport): string {
  const lines: string[] = [];
  lines.push(`RELEASE_GATE: ${report.releaseGate.gate} - ${report.releaseGate.status}`);
  lines.push(`RELEASE_GATE_REASON: ${report.releaseGate.reason}`);
  lines.push(`QUALITY_GATE: ${report.qualityGate.gate} - ${report.qualityGate.status}`);
  lines.push(`QUALITY_GATE_REASON: ${report.qualityGate.reason}`);
  lines.push(`VISUAL_GATE: ${report.visualGate.id}`);
  lines.push(`FIRST_FAILING_VISUAL_GATE: ${report.firstFailingVisualGate?.id ?? 'NONE'}`);
  lines.push(`STATUS: ${report.visualGate.status}`);
  lines.push(`REASON: ${report.visualGate.reason}`);
  lines.push('PROOF_FOUND:');
  if (report.proofFound.length === 0) lines.push('- none');
  else report.proofFound.forEach((proof) => lines.push(`- ${proof}`));
  lines.push('PROOF_MISSING:');
  if (report.proofMissing.length === 0) lines.push('- none');
  else report.proofMissing.forEach((proof) => lines.push(`- ${proof}`));
  lines.push(`NEXT_MOVE: ${report.visualGate.nextMove}`);
  lines.push(`DO_NOT_TOUCH: ${report.visualGate.doNotTouch}`);
  return lines.join('\n');
}

export function gatherVisualGateEvidence(repoRoot = process.cwd()): VisualGateEvidence {
  const pixelLockSpec = readIfExists(repoRoot, 'tests/dashboard/live-artifact-pixel-lock.spec.ts');
  const visualScreenshotSpec = readIfExists(repoRoot, 'tests/e2e/landing-dashboard-visual.spec.ts');
  const nonOwnerHarnessSpec = readIfExists(repoRoot, 'tests/e2e/non-owner-beta-harness.spec.ts');

  const currentMoveVisible =
    hasAll(pixelLockSpec, [
      "getByRole('heading', { name: GOLDEN_DOCUMENT_DIRECTIVE })",
      "getByTestId('dashboard-document-body')",
      "getByRole('button', { name: /^save$/i })",
    ]) &&
    hasRegexAll(pixelLockSpec, [/Ready role-fit answer/i, /Use this role-fit packet/i]);

  const sourceTrailVisible =
    hasAll(nonOwnerHarnessSpec, ["getByTestId('dashboard-source-trail-panel')"]) &&
    hasRegexAll(nonOwnerHarnessSpec, [/Email thread|Connected source evidence/i]);

  const approvalControlsSafe =
    hasRegexAll(pixelLockSpec, [
      /name:\s*\/\^skip/i,
      /name:\s*\/\^save/i,
      /name:\s*\/\^approve/i,
      /approve & send/i,
      /toHaveCount\(0\)/i,
    ]);

  const responsiveNoOverflow =
    hasAll(pixelLockSpec, ['width: 390', 'scrollWidth', 'clientWidth']) &&
    hasRegexAll(pixelLockSpec, [/noHorizontalScroll|hasOverflow/i]);

  const screenshotCapture =
    hasAll(visualScreenshotSpec, [
      "test('capture dashboard desktop and mobile'",
      'dashboard-1440.png',
      'dashboard-390.png',
      'page.screenshot',
      'scrollWidth',
      'clientWidth',
      'expect(hasOverflow).toBe(false)',
    ]);

  const mockOnly =
    hasAll(visualScreenshotSpec, ['MOCK_USER_ID', 'setupDashboardMocks']) &&
    hasAll(nonOwnerHarnessSpec, ['NON_OWNER_BETA_USER_ID']);

  return {
    currentMoveProof: proofIf(
      currentMoveVisible,
      'tests/dashboard/live-artifact-pixel-lock.spec.ts asserts current move frame, finished artifact body, and primary action are visible.',
    ),
    sourceTrailProof: proofIf(
      sourceTrailVisible,
      'tests/e2e/non-owner-beta-harness.spec.ts asserts dashboard source trail panel contains understandable source labels.',
    ),
    approvalControlProof: proofIf(
      approvalControlsSafe,
      'tests/dashboard/live-artifact-pixel-lock.spec.ts asserts Save/Skip/Approve controls are visible and Approve & send is absent.',
    ),
    responsiveProof: proofIf(
      responsiveNoOverflow,
      'tests/dashboard/live-artifact-pixel-lock.spec.ts asserts mobile readability at 390px and no horizontal overflow.',
    ),
    screenshotProof: proofIf(
      screenshotCapture,
      'tests/e2e/landing-dashboard-visual.spec.ts captures dashboard desktop/mobile screenshots and checks no horizontal overflow.',
    ),
    mockOnlyProof: proofIf(
      mockOnly,
      'Visual proof is deterministic mock/screenshot proof only; it is not real non-owner beta proof.',
    ),
  };
}

async function readReleaseAndQualitySummaries(): Promise<{
  releaseGate: ReleaseGateSummary;
  qualityGate: QualityGateSummary;
}> {
  const releaseReport = buildReleaseGateReport(await gatherReleaseGateEvidence());
  const releaseGate: ReleaseGateSummary = {
    gate: releaseReport.firstFailingGate.id,
    status: releaseReport.firstFailingGate.status,
    reason: releaseReport.firstFailingGate.reason,
  };
  const qualityReport = buildQualityGateReport({ releaseGate });
  const qualityGate: QualityGateSummary = {
    gate: qualityReport.qualityGate.id,
    status: qualityReport.qualityGate.status,
    reason: qualityReport.qualityGate.reason,
  };

  return { releaseGate, qualityGate };
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  readReleaseAndQualitySummaries()
    .then(({ releaseGate, qualityGate }) => {
      const report = buildVisualGateReport({
        releaseGate,
        qualityGate,
        evidence: gatherVisualGateEvidence(),
      });
      console.log(formatVisualGateReport(report));
      process.exit(report.visualGate.status === 'PASS' ? 0 : 1);
    })
    .catch((error: unknown) => {
      console.error(
        `[visual-gate-status] fatal: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}
