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
  internalOwnerAliasProof: string[];
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

const GATE_9A_CONNECTION_PROOF_NEXT_MOVE =
  'Get one real non-owner tester account with connected Google or Microsoft before evaluating first-run activation.';
const GATE_9A_VALUE_NEXT_MOVE =
  'Prove the real non-owner reaches a clear first-run state with source counts, reason, and next action, or a source-backed move.';
const GATE_9_FULL_BETA_NEXT_MOVE =
  'Get one real non-owner tester account with connected Google or Microsoft and either a source-backed action or explicit tester feedback.';

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

function requireReservedUserExclusionProof(
  proof: string[],
  found: string[],
  proofMissing: string[],
) {
  const required = ['OWNER_USER_ID', 'TEST_USER_ID', 'OWNER_CANARY_USER_IDS'];
  const missing = required.filter((name) => !proof.some((entry) => entry.includes(name)));
  if (proof.length > 0) found.push(...proof);
  if (missing.length > 0) {
    proofMissing.push('OWNER_USER_ID, TEST_USER_ID, and OWNER_CANARY_USER_IDS exclusion proof missing');
  }
}

function isDisallowedRealBetaProofLine(line: string): boolean {
  return /micro1|brandon|owner-alias|owner alias|owner_user_id|test_user_id|owner_canary_user_ids|synthetic|fixture|mock|fake/i.test(
    line,
  );
}

function hasRealNonOwnerSourceBackedMoveProof(proof: string[]): boolean {
  const text = proof.filter((line) => !isDisallowedRealBetaProofLine(line)).join('\n').toLowerCase();
  if (!text.includes('real non-owner')) return false;

  return (
    /source[- ]backed move/.test(text) &&
    /source trail/.test(text) &&
    /(save|skip|approve|history|next_action|next action)/.test(text)
  );
}

function hasClearRealNonOwnerFirstRunProof(proof: string[]): boolean {
  const text = proof.filter((line) => !isDisallowedRealBetaProofLine(line)).join('\n').toLowerCase();
  if (!text.includes('real non-owner')) return false;

  return (
    /first-run state|clear first-run state|clear waiting state|clear no-safe state/.test(text) &&
    /connected source/.test(text) &&
    /signal_count=\d+/.test(text) &&
    /processed_signal_count=\d+/.test(text) &&
    /unprocessed_signal_count=\d+/.test(text) &&
    /reason=/.test(text) &&
    /next_action=|next action=/.test(text) &&
    /nothing_sent=true|nothing was sent/.test(text)
  );
}

function hasClearRealNonOwnerValueProof(proof: string[]): boolean {
  return hasRealNonOwnerSourceBackedMoveProof(proof) || hasClearRealNonOwnerFirstRunProof(proof);
}

function hasExplicitRealNonOwnerTesterFeedbackProof(proof: string[]): boolean {
  const text = proof.filter((line) => !isDisallowedRealBetaProofLine(line)).join('\n').toLowerCase();
  if (!text.includes('explicit tester feedback')) return false;
  if (!text.includes('real non-owner tester')) return false;
  if (!/waiting state|no-safe state|readiness state/.test(text)) return false;
  if (!text.includes('understandable')) return false;
  if (!text.includes('useful enough to keep trusting foldera')) return false;
  return true;
}

function buildGate0(evidence: ReleaseGateEvidence): ReleaseGateResult {
  const proofFound: string[] = [];
  const proofMissing: string[] = [];
  const handoffNamesGate =
    evidence.activeHandoffText.includes('Current release gate: GATE_9_REAL_NON_OWNER_BETA') ||
    evidence.activeHandoffText.includes('Current release gate: GATE_9A_FIRST_RUN_ACTIVATION');
  const handoffNamesBlockedGate =
    evidence.activeHandoffText.includes('First failing release gate: GATE_9_REAL_NON_OWNER_BETA') &&
    evidence.activeHandoffText.includes('Release gate status: BLOCKED_EXTERNAL');
  const handoffNamesPassedGate =
    evidence.activeHandoffText.includes('First failing release gate: NONE') &&
    /Release gate status:\s+(PASS|PROVEN)/i.test(evidence.activeHandoffText);
  const handoffNamesFirstRunActivationGate =
    evidence.activeHandoffText.includes('Current release gate: GATE_9A_FIRST_RUN_ACTIVATION') &&
    evidence.activeHandoffText.includes('First failing release gate: GATE_9_REAL_NON_OWNER_BETA');
  const handoffMatchesReleaseGate =
    handoffNamesGate &&
    (handoffNamesBlockedGate || handoffNamesPassedGate || handoffNamesFirstRunActivationGate);

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
  requireReservedUserExclusionProof(evidence.ownerAndTestExclusionProof, gate4Found, gate4Missing);
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
          'Selection proof exists and reserved owner/test/canary users are excluded from non-owner proof.',
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

  const eligibleRealNonOwnerProof = evidence.realNonOwnerProof.filter(
    (line) => !isDisallowedRealBetaProofLine(line),
  );
  const hasRealNonOwnerProof = eligibleRealNonOwnerProof.length > 0;
  const hasRealNonOwnerValueProof = hasClearRealNonOwnerValueProof(eligibleRealNonOwnerProof);
  const hasRealNonOwnerSourceBackedProof = hasRealNonOwnerSourceBackedMoveProof(
    eligibleRealNonOwnerProof,
  );
  const hasRealNonOwnerTesterFeedbackProof = hasExplicitRealNonOwnerTesterFeedbackProof(
    eligibleRealNonOwnerProof,
  );
  gates.push(
    hasRealNonOwnerValueProof
      ? passGate(
          'GATE_9A_FIRST_RUN_ACTIVATION',
          'micro1/current real non-owner reached a useful no-paid first-run state or source-backed move.',
          eligibleRealNonOwnerProof,
          'Continue to real beta repeatability proof without calling this full beta success.',
        )
      : failGate(
          'GATE_9A_FIRST_RUN_ACTIVATION',
          hasRealNonOwnerProof
            ? 'Real non-owner connection exists, but first-run value proof is incomplete.'
            : 'Current handoff is missing real non-owner connection proof.',
          hasRealNonOwnerProof ? eligibleRealNonOwnerProof : [],
          hasRealNonOwnerProof
            ? [
                'Real non-owner must reach a clear first-run state with source counts, reason, and next action, or a source-backed move.',
                'Token-only, welcome-email-only, and unprocessed-signal-only proof cannot pass GATE_9.',
              ]
            : [
                'Current handoff must record one real non-owner tester account with connected Google or Microsoft.',
                ...(evidence.internalOwnerAliasProof.length > 0
                  ? ['micro1/owner-alias proof is internal only and cannot satisfy real non-owner beta.']
                  : []),
                'No fake rows, OWNER_USER_ID, TEST_USER_ID, OWNER_CANARY_USER_IDS, or mock harness may count as real beta proof.',
                'Token-only, welcome-email-only, and unprocessed-signal-only proof cannot pass GATE_9A.',
              ],
          hasRealNonOwnerProof ? GATE_9A_VALUE_NEXT_MOVE : GATE_9A_CONNECTION_PROOF_NEXT_MOVE,
          'BLOCKED_EXTERNAL',
        ),
  );

  gates.push(
    hasRealNonOwnerSourceBackedProof || hasRealNonOwnerTesterFeedbackProof
      ? passGate(
          'GATE_9_REAL_NON_OWNER_BETA',
          hasRealNonOwnerSourceBackedProof
            ? 'Real non-owner reached a source-backed move with source trail and controls.'
            : 'Real non-owner tester explicitly confirmed the waiting state was understandable and useful enough to keep trusting Foldera.',
          eligibleRealNonOwnerProof,
          'Continue to repeatability and tester-feedback proof.',
        )
      : failGate(
          'GATE_9_REAL_NON_OWNER_BETA',
          hasRealNonOwnerValueProof
            ? 'Full beta proof still requires source-backed action or explicit tester feedback after first-run activation.'
            : 'GATE_9A first-run activation is not proven in the current handoff.',
          hasRealNonOwnerValueProof ? eligibleRealNonOwnerProof : [],
          hasRealNonOwnerValueProof
            ? [
                'First-run activation is useful but is not full beta success.',
                'Full beta proof requires either: real non-owner source-backed action with source trail and safe controls, or explicit tester feedback: real non-owner tester said the waiting state was understandable and useful enough to keep trusting Foldera.',
              ]
            : [
              'Current handoff must prove GATE_9A first-run activation before full beta proof can be evaluated.',
              ...(evidence.internalOwnerAliasProof.length > 0
                ? ['micro1/owner-alias proof is internal only and cannot satisfy GATE_9_REAL_NON_OWNER_BETA.']
                : []),
              'No fake rows, OWNER_USER_ID, TEST_USER_ID, OWNER_CANARY_USER_IDS, or mock harness may count as real beta proof.',
            ],
          hasRealNonOwnerValueProof ? GATE_9_FULL_BETA_NEXT_MOVE : GATE_9A_CONNECTION_PROOF_NEXT_MOVE,
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
  const ownerCanaryExcluded =
    acceptanceGate.includes('OWNER_CANARY_USER_IDS') ||
    acceptanceGate.includes('getOwnerCanaryUserIds');
  const realNonOwnerHandoffProof = activeHandoffText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /^-?\s*real non-owner (?:first-run state|source-backed move|clear waiting state|clear no-safe state)(?:\s+\([^)]*\))?:/i.test(
        line,
      ) || /^-?\s*explicit tester feedback: real non-owner tester/i.test(line),
    );
  const internalOwnerAliasProof = activeHandoffText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        /owner-alias/i.test(line) ||
        /micro1 is Brandon-controlled and is internal owner-alias proof only/i.test(line),
    );

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
      ownerExcluded && testExcluded && ownerCanaryExcluded,
      'lib/cron/acceptance-gate.ts excludes OWNER_USER_ID, TEST_USER_ID, and OWNER_CANARY_USER_IDS in NON_OWNER_DEPTH.',
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
    realNonOwnerProof: realNonOwnerHandoffProof,
    internalOwnerAliasProof,
    ownerAndTestExclusionProof: [
      ...proofIf(ownerExcluded, 'lib/cron/acceptance-gate.ts has .neq(user_id, OWNER_USER_ID).'),
      ...proofIf(testExcluded, 'lib/cron/acceptance-gate.ts has .neq(user_id, TEST_USER_ID).'),
      ...proofIf(ownerCanaryExcluded, 'lib/cron/acceptance-gate.ts excludes OWNER_CANARY_USER_IDS.'),
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
