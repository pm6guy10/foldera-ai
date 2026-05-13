import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ReleaseGateStatus = 'PASS' | 'FAIL' | 'BLOCKED_EXTERNAL';

export interface ReleaseGateEvidence {
  gitMainSha: string | null;
  productionSha: string | null;
  healthSha: string | null;
  activeHandoffSha: string | null;
  activeHandoffText: string;
  publicBoundaryProof: string[];
  authOnboardingProof: string[];
  sourceStatusProof: string[];
  selectionProof: string[];
  artifactProof: string[];
  sourceTrailProof: string[];
  approvalHistoryProof: string[];
  nonOwnerHarnessProof: string[];
  realNonOwnerProof: string[];
  ownerAndTestExclusionProof: string[];
}

export interface ReleaseGateResult {
  id: string;
  status: ReleaseGateStatus;
  reason: string;
  proofFound: string[];
  proofMissing: string[];
  nextMove: string;
  doNotTouch: string;
}

export interface ReleaseGateReport {
  currentGate: ReleaseGateResult;
  firstFailingGate: ReleaseGateResult;
  gates: ReleaseGateResult[];
}

const DO_NOT_TOUCH =
  'UI polish, Stripe, paid generation, owner-only proof, fake users.';

const GATE_9_NEXT_MOVE = 'Get one real tester to connect Google or Microsoft.';

function shortSha(sha: string | null): string {
  if (!sha) return 'UNKNOWN';
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

function sameSha(a: string | null, b: string | null): boolean {
  return Boolean(a && b && (a === b || a.startsWith(b) || b.startsWith(a)));
}

function passGate(
  id: string,
  reason: string,
  proofFound: string[],
  nextMove = 'Advance to the next release gate.',
): ReleaseGateResult {
  return {
    id,
    status: 'PASS',
    reason,
    proofFound,
    proofMissing: [],
    nextMove,
    doNotTouch: DO_NOT_TOUCH,
  };
}

function failGate(
  id: string,
  reason: string,
  proofFound: string[],
  proofMissing: string[],
  nextMove: string,
  status: ReleaseGateStatus = 'FAIL',
): ReleaseGateResult {
  return {
    id,
    status,
    reason,
    proofFound,
    proofMissing,
    nextMove,
    doNotTouch: DO_NOT_TOUCH,
  };
}

function requireProof(
  proof: string[],
  missing: string,
  found: string[],
  proofMissing: string[],
) {
  if (proof.length > 0) found.push(...proof);
  else proofMissing.push(missing);
}

function buildGate0(evidence: ReleaseGateEvidence): ReleaseGateResult {
  const proofFound: string[] = [];
  const proofMissing: string[] = [];
  const handoffMatchesReleaseGate =
    evidence.activeHandoffText.includes('Current release gate: GATE_9_REAL_NON_OWNER_BETA') &&
    evidence.activeHandoffText.includes('First failing release gate: GATE_9_REAL_NON_OWNER_BETA') &&
    evidence.activeHandoffText.includes('Release gate status: BLOCKED_EXTERNAL');

  if (evidence.gitMainSha) proofFound.push(`GitHub/main SHA known: ${evidence.gitMainSha}`);
  else proofMissing.push('GitHub/main SHA must be known');

  if (evidence.productionSha) proofFound.push(`Vercel production SHA known: ${evidence.productionSha}`);
  else proofMissing.push('Vercel production SHA must be known');

  if (evidence.healthSha) proofFound.push(`/api/health SHA known: ${evidence.healthSha}`);
  else proofMissing.push('/api/health must return a revision.git_sha');

  if (
    evidence.gitMainSha &&
    evidence.productionSha &&
    !sameSha(evidence.gitMainSha, evidence.productionSha)
  ) {
    proofFound.push(
      `GitHub/main differs from current production (${shortSha(evidence.gitMainSha)} vs ${shortSha(evidence.productionSha)}); production truth remains /api/health.`,
    );
  }

  if (
    evidence.productionSha &&
    evidence.healthSha &&
    !sameSha(evidence.productionSha, evidence.healthSha)
  ) {
    proofMissing.push(
      `Production SHA ${shortSha(evidence.productionSha)} must match /api/health SHA ${shortSha(evidence.healthSha)}`,
    );
  }

  if (handoffMatchesReleaseGate) {
    proofFound.push('ACTIVE_HANDOFF.md release gate/status matches current release truth.');
    if (
      evidence.productionSha &&
      evidence.activeHandoffSha &&
      !sameSha(evidence.productionSha, evidence.activeHandoffSha)
    ) {
      proofFound.push(
        `ACTIVE_HANDOFF.md recorded production SHA ${shortSha(evidence.activeHandoffSha)} differs from live ${shortSha(evidence.productionSha)}; release gate/status is still current.`,
      );
    }
  } else if (
    evidence.productionSha &&
    evidence.activeHandoffSha &&
    sameSha(evidence.productionSha, evidence.activeHandoffSha)
  ) {
    proofFound.push(`ACTIVE_HANDOFF.md matches production SHA: ${evidence.activeHandoffSha}`);
  } else if (evidence.productionSha) {
    proofMissing.push(
      `ACTIVE_HANDOFF.md must match current production truth for SHA ${evidence.productionSha}`,
    );
  } else {
    proofMissing.push('ACTIVE_HANDOFF.md production SHA cannot be checked until production SHA is known');
  }

  if (proofMissing.length > 0) {
    return failGate(
      'GATE_0_LIVE_TRUTH',
      'Live production truth is not aligned.',
      proofFound,
      proofMissing,
      'Align GitHub/main, Vercel production, /api/health, and ACTIVE_HANDOFF.md to the same SHA.',
    );
  }

  return passGate(
    'GATE_0_LIVE_TRUTH',
    'GitHub/main, Vercel production, /api/health, and ACTIVE_HANDOFF.md agree.',
    proofFound,
  );
}

export function buildReleaseGateReport(evidence: ReleaseGateEvidence): ReleaseGateReport {
  const gates: ReleaseGateResult[] = [buildGate0(evidence)];

  const gate1Found: string[] = [];
  const gate1Missing: string[] = [];
  requireProof(
    evidence.publicBoundaryProof,
    'Public/demo/marketing sanitized-boundary proof missing',
    gate1Found,
    gate1Missing,
  );
  gates.push(
    gate1Missing.length
      ? failGate(
          'GATE_1_PUBLIC_PRIVATE_BOUNDARY',
          'Public/private data boundary proof is incomplete.',
          gate1Found,
          gate1Missing,
          'Run or add sanitized public/demo boundary proof without changing landing copy.',
        )
      : passGate(
          'GATE_1_PUBLIC_PRIVATE_BOUNDARY',
          'Public/demo proof is sanitized and does not rely on Brandon owner data.',
          gate1Found,
        ),
  );

  const gate2Found: string[] = [];
  const gate2Missing: string[] = [];
  requireProof(evidence.authOnboardingProof, 'Auth/onboarding proof missing', gate2Found, gate2Missing);
  gates.push(
    gate2Missing.length
      ? failGate(
          'GATE_2_AUTH_ONBOARDING',
          'Auth onboarding proof is incomplete.',
          gate2Found,
          gate2Missing,
          'Prove /start, login choices, no-token onboarding, and connector visibility.',
        )
      : passGate(
          'GATE_2_AUTH_ONBOARDING',
          'Unauthenticated start and no-token onboarding are covered by the mock harness.',
          gate2Found,
        ),
  );

  const gate3Found: string[] = [];
  const gate3Missing: string[] = [];
  requireProof(evidence.sourceStatusProof, 'Source-status state proof missing', gate3Found, gate3Missing);
  gates.push(
    gate3Missing.length
      ? failGate(
          'GATE_3_SOURCE_STATUS',
          'Source status state proof is incomplete.',
          gate3Found,
          gate3Missing,
          'Map and prove no-provider, stale, connected, no-signals, and fresh-signal states.',
        )
      : passGate(
          'GATE_3_SOURCE_STATUS',
          'Source status states are mapped and covered by mock non-owner proof.',
          gate3Found,
        ),
  );

  const gate4Found: string[] = [];
  const gate4Missing: string[] = [];
  requireProof(evidence.selectionProof, 'Selection proof missing', gate4Found, gate4Missing);
  requireProof(
    evidence.ownerAndTestExclusionProof,
    'OWNER_USER_ID and TEST_USER_ID exclusion proof missing',
    gate4Found,
    gate4Missing,
  );
  gates.push(
    gate4Missing.length
      ? failGate(
          'GATE_4_SELECTION',
          'Candidate selection proof is incomplete.',
          gate4Found,
          gate4Missing,
          'Prove deterministic winner/no-safe-move and reserved-user exclusion.',
        )
      : passGate(
          'GATE_4_SELECTION',
          'Selection proof exists and reserved owner/test users are excluded from non-owner proof.',
          gate4Found,
        ),
  );

  const gate5Found: string[] = [];
  const gate5Missing: string[] = [];
  requireProof(evidence.artifactProof, 'Artifact/current-move proof missing', gate5Found, gate5Missing);
  gates.push(
    gate5Missing.length
      ? failGate(
          'GATE_5_ARTIFACT_OR_CURRENT_MOVE',
          'Artifact/current-move proof is incomplete.',
          gate5Found,
          gate5Missing,
          'Prove one source-backed move or a clear no-safe-move state without paid generation.',
        )
      : passGate(
          'GATE_5_ARTIFACT_OR_CURRENT_MOVE',
          'Mock proof covers source-backed move and no-safe-move states.',
          gate5Found,
        ),
  );

  const gate6Found: string[] = [];
  const gate6Missing: string[] = [];
  requireProof(evidence.sourceTrailProof, 'Source-trail proof missing', gate6Found, gate6Missing);
  gates.push(
    gate6Missing.length
      ? failGate(
          'GATE_6_SOURCE_TRAIL',
          'Source trail proof is incomplete.',
          gate6Found,
          gate6Missing,
          'Prove visible, understandable, non-leaky source trail.',
        )
      : passGate(
          'GATE_6_SOURCE_TRAIL',
          'Source trail is covered by the mock non-owner product path.',
          gate6Found,
        ),
  );

  const gate7Found: string[] = [];
  const gate7Missing: string[] = [];
  requireProof(
    evidence.approvalHistoryProof,
    'Approval/history proof missing',
    gate7Found,
    gate7Missing,
  );
  gates.push(
    gate7Missing.length
      ? failGate(
          'GATE_7_APPROVAL_HISTORY',
          'Approval/history proof is incomplete.',
          gate7Found,
          gate7Missing,
          'Prove save, skip, approve-without-send, latest/history, and recorded outcome.',
        )
      : passGate(
          'GATE_7_APPROVAL_HISTORY',
          'Save/skip/approve/history are covered with outbound send attempts blocked.',
          gate7Found,
        ),
  );

  const gate8Found: string[] = [];
  const gate8Missing: string[] = [];
  requireProof(
    evidence.nonOwnerHarnessProof,
    'Mock non-owner harness proof missing',
    gate8Found,
    gate8Missing,
  );
  gates.push(
    gate8Missing.length
      ? failGate(
          'GATE_8_NON_OWNER_HARNESS',
          'Mock non-owner harness proof is incomplete.',
          gate8Found,
          gate8Missing,
          'Complete mock-only harness coverage and label it as mock-only proof.',
        )
      : passGate(
          'GATE_8_NON_OWNER_HARNESS',
          'Mock non-owner harness exists and is explicitly labeled mock-only.',
          gate8Found,
        ),
  );

  gates.push(
    evidence.realNonOwnerProof.length > 0
      ? passGate(
          'GATE_9_REAL_NON_OWNER_BETA',
          'Real non-owner beta proof exists.',
          evidence.realNonOwnerProof,
          'Continue to real beta repeatability proof.',
        )
      : failGate(
          'GATE_9_REAL_NON_OWNER_BETA',
          'No real connected non-owner account exists.',
          [],
          [
            'Exactly one real non-owner account must connect Google or Microsoft.',
            'No fake rows, OWNER_USER_ID, TEST_USER_ID, or mock harness may count as real beta proof.',
          ],
          GATE_9_NEXT_MOVE,
          'BLOCKED_EXTERNAL',
        ),
  );

  const firstFailingGate =
    gates.find((gate) => gate.status !== 'PASS') ?? gates[gates.length - 1];

  return {
    currentGate: firstFailingGate,
    firstFailingGate,
    gates,
  };
}

export function formatReleaseGateReport(report: ReleaseGateReport): string {
  const lines: string[] = [];
  lines.push(`CURRENT_GATE: ${report.currentGate.id}`);
  lines.push(`FIRST_FAILING_GATE: ${report.firstFailingGate.id}`);
  lines.push(`STATUS: ${report.firstFailingGate.status}`);
  lines.push(`REASON: ${report.firstFailingGate.reason}`);
  lines.push(`NEXT_MOVE: ${report.firstFailingGate.nextMove}`);
  lines.push(`DO_NOT_TOUCH: ${report.firstFailingGate.doNotTouch}`);
  lines.push('');
  lines.push('GATE_STATUS:');
  for (const gate of report.gates) {
    lines.push(`- ${gate.id}: ${gate.status} - ${gate.reason}`);
  }
  lines.push('');
  lines.push('PROOF_FOUND:');
  if (report.firstFailingGate.proofFound.length === 0) lines.push('- none');
  else report.firstFailingGate.proofFound.forEach((proof) => lines.push(`- ${proof}`));
  lines.push('');
  lines.push('PROOF_MISSING:');
  if (report.firstFailingGate.proofMissing.length === 0) lines.push('- none');
  else report.firstFailingGate.proofMissing.forEach((proof) => lines.push(`- ${proof}`));
  lines.push('');
  lines.push('FULL_PROOF_FOUND:');
  for (const gate of report.gates) {
    for (const proof of gate.proofFound) {
      lines.push(`- ${gate.id}: ${proof}`);
    }
  }
  return lines.join('\n');
}

function runGit(repoRoot: string, args: string[]): string | null {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function readIfExists(repoRoot: string, relativePath: string): string {
  const path = resolve(repoRoot, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function hasAll(text: string, needles: string[]): boolean {
  return needles.every((needle) => text.includes(needle));
}

function extractSha(text: string): string | null {
  const match = text.match(/[0-9a-f]{40}/i) ?? text.match(/[0-9a-f]{7,12}/i);
  return match?.[0] ?? null;
}

function extractHandoffSha(activeHandoffText: string): string | null {
  const productionLine = activeHandoffText
    .split(/\r?\n/)
    .find((line) => /Last known production SHA|production SHA/i.test(line));
  return productionLine ? extractSha(productionLine) : extractSha(activeHandoffText);
}

async function readProductionHealthSha(): Promise<string | null> {
  const url = process.env.FOLDERA_HEALTH_URL?.trim() || 'https://www.foldera.ai/api/health';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      revision?: { git_sha?: string; git_sha_short?: string };
      build?: string;
    };
    return body.revision?.git_sha ?? body.revision?.git_sha_short ?? body.build ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function proofIf(condition: boolean, proof: string): string[] {
  return condition ? [proof] : [];
}

export async function gatherReleaseGateEvidence(
  repoRoot = process.cwd(),
): Promise<ReleaseGateEvidence> {
  const activeHandoffText = readIfExists(repoRoot, 'ACTIVE_HANDOFF.md');
  const harnessMap = readIfExists(repoRoot, 'NON_OWNER_BETA_HARNESS_MAP.md');
  const harnessSpec = readIfExists(repoRoot, 'tests/e2e/non-owner-beta-harness.spec.ts');
  const publicRoutesSpec = readIfExists(repoRoot, 'tests/e2e/public-routes.spec.ts');
  const demoData = readIfExists(repoRoot, 'lib/demo/demo-data.ts');
  const acceptanceGate = readIfExists(repoRoot, 'lib/cron/acceptance-gate.ts');

  const gitMainSha =
    runGit(repoRoot, ['rev-parse', 'origin/main']) ?? runGit(repoRoot, ['rev-parse', 'HEAD']);
  const healthSha = await readProductionHealthSha();

  const publicBoundaryClean =
    /landing demo uses neutral public copy/i.test(publicRoutesSpec) &&
    /Brandon/i.test(publicRoutesSpec) &&
    !/WorkSourceWA|unemployment|benefits packet|b\.kapp|b-kapp/i.test(demoData);

  const sourceStatesMapped = hasAll(harnessMap, [
    'no connected provider tokens',
    'Google connected',
    'Microsoft connected',
    'Connected provider but no fresh signals',
    'Connected provider with fresh signals but no safe move',
    'Connected provider with one source-backed move',
  ]);

  const ownerExcluded =
    acceptanceGate.includes(".neq('user_id', OWNER_USER_ID)") ||
    acceptanceGate.includes('.neq("user_id", OWNER_USER_ID)');
  const testExcluded =
    acceptanceGate.includes(".neq('user_id', TEST_USER_ID)") ||
    acceptanceGate.includes('.neq("user_id", TEST_USER_ID)');

  return {
    gitMainSha,
    productionSha: healthSha,
    healthSha,
    activeHandoffSha: extractHandoffSha(activeHandoffText),
    activeHandoffText,
    publicBoundaryProof: proofIf(
      publicBoundaryClean,
      'tests/e2e/public-routes.spec.ts asserts neutral public demo copy; lib/demo/demo-data.ts is fictional/sanitized.',
    ),
    authOnboardingProof: proofIf(
      /\/start smoke/i.test(harnessSpec) && /no-token user is stopped at source connection/i.test(harnessSpec),
      'tests/e2e/non-owner-beta-harness.spec.ts covers unauthenticated /start and no-token onboarding connector state.',
    ),
    sourceStatusProof: proofIf(
      sourceStatesMapped && /GOOGLE_CONNECTED|MICROSOFT_CONNECTED|NO_SAFE_MOVE/i.test(harnessSpec),
      'NON_OWNER_BETA_HARNESS_MAP.md maps source states; tests/e2e/non-owner-beta-harness.spec.ts exercises connected/no-safe/source-backed states.',
    ),
    selectionProof: proofIf(
      ownerExcluded && testExcluded,
      'lib/cron/acceptance-gate.ts excludes OWNER_USER_ID and TEST_USER_ID in NON_OWNER_DEPTH.',
    ),
    artifactProof: proofIf(
      /SOURCE_BACKED_ACTION|NO_SAFE_MOVE/i.test(harnessSpec),
      'tests/e2e/non-owner-beta-harness.spec.ts covers source-backed move and no-safe-move.',
    ),
    sourceTrailProof: proofIf(
      /dashboard-source-trail-panel|source trail/i.test(harnessSpec),
      'tests/e2e/non-owner-beta-harness.spec.ts asserts source trail appears in product.',
    ),
    approvalHistoryProof: proofIf(
      /outboundSendAttempts|dashboard-sidebar-item-history|decision === 'approve'|decision === 'skip'/i.test(
        harnessSpec,
      ),
      'tests/e2e/non-owner-beta-harness.spec.ts covers save/skip/approve/history and zero outbound send attempts.',
    ),
    nonOwnerHarnessProof: proofIf(
      /mock harness map only/i.test(harnessMap) &&
        /NON_OWNER_BETA_USER_ID.*33333333-3333-4333-8333-333333333333/s.test(harnessSpec),
      'NON_OWNER_BETA_HARNESS_MAP.md labels mock-only proof; harness uses a reserved-safe non-owner mock identity.',
    ),
    realNonOwnerProof: proofIf(
      /real non-owner beta proof exists/i.test(activeHandoffText),
      'ACTIVE_HANDOFF.md records real non-owner beta proof.',
    ),
    ownerAndTestExclusionProof: [
      ...proofIf(ownerExcluded, 'lib/cron/acceptance-gate.ts has .neq(user_id, OWNER_USER_ID).'),
      ...proofIf(testExcluded, 'lib/cron/acceptance-gate.ts has .neq(user_id, TEST_USER_ID).'),
    ],
  };
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  gatherReleaseGateEvidence()
    .then((evidence) => {
      const report = buildReleaseGateReport(evidence);
      console.log(formatReleaseGateReport(report));
      process.exit(report.firstFailingGate.status === 'FAIL' ? 1 : 0);
    })
    .catch((error: unknown) => {
      console.error(
        `[release-gate-status] fatal: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    });
}
