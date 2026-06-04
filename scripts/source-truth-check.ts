import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type FolderaContract = {
  active?: boolean;
  active_issue?: number | null;
  backlog_id?: string;
  authority_status?: string;
  base_commit?: string;
  allowed_file_patterns?: string[];
  forbidden_file_patterns?: string[];
  required_local_proof?: string[] | string;
  acceptance_condition?: string;
  next_command?: string;
};

const ACTIVE_ISSUE = 179;
const COMPLETED_RUNG_2_ISSUE = 175;
const RUNG_2_PR = 177;
const OPEN_THREADS_ISSUE = 165;
const COMPLETED_COMMAND_OS_ISSUE = 166;
const COMMAND_OS_PR = 167;
const COMPLETED_MASTER_SYNTHESIS_ISSUE = 170;
const MASTER_SYNTHESIS_PR = 172;
const COMPLETED_FIRST_RUNG_ISSUE = 173;
const FIRST_RUNG_PR = 174;
const BASE_COMMIT = '17e0699238cd11e80b4891f236be860abe32eb72';
const NEXT_SEAM = 'blocked - reason issue #179 must be reviewed/merged before the next rung is authorized';

const REQUIRED_PROOF_COMMANDS = [
  'npm run health',
  'npx vitest run lib/work-packets/__tests__/work-packet-brain.test.ts lib/slack-test-mode/__tests__/work-packet-review.test.ts lib/workday-presence/__tests__/work-packet-state-update.test.ts --reporter=verbose',
  'npm run gate:command',
  'npm run gate:continuity',
  'git diff --check',
];

const REQUIRED_ALLOWED_FILES = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'scripts/source-truth-check.ts',
  'tests/config/__tests__/**',
  'tests/fixtures/work-packets/source-signals.ts',
  'lib/work-packets/**',
  'lib/slack-test-mode/work-packet-review.ts',
  'lib/slack-test-mode/__tests__/work-packet-review.test.ts',
  'lib/workday-presence/__tests__/work-packet-state-update.test.ts',
];

const FORBIDDEN_PRODUCT_PATHS = [
  'app/**',
  'components/**',
  'components/foldera/LandingPage.tsx',
  'app/page.tsx',
  'next.config.mjs',
  'app/api/slack/**',
  'lib/slack/**',
  'lib/workday-presence/source-backed-state.ts',
  'lib/workday-presence/__tests__/source-backed-state.test.ts',
  'supabase/**',
  'app/dashboard/**',
  'components/dashboard/**',
  'lib/auth/**',
  'app/api/auth/**',
  'app/api/google/**',
  'app/api/microsoft/**',
  'app/api/stripe/**',
  'lib/stripe/**',
  'lib/billing/**',
  'package.json',
  'package-lock.json',
  'FOLDERA_MASTER_SYNTHESIS_DRAFT.md',
  'Dependabot',
  'Vercel settings',
  'Slack app settings',
  'connector platform expansion',
  'Teams expansion',
  'email expansion',
  'calendar expansion',
  'schema implementation',
  'source-lane implementation',
  'data mutation',
  'outreach',
  'scraping',
  'paid ads',
  'customer data mutation',
  'fake enterprise claims',
  'fake compliance claims',
  'broad cleanup',
];

const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 151, 154, 159, 163, COMPLETED_COMMAND_OS_ISSUE, COMPLETED_MASTER_SYNTHESIS_ISSUE, COMPLETED_FIRST_RUNG_ISSUE, COMPLETED_RUNG_2_ISSUE];

function readRepoFile(root: string, file: string): string {
  const path = join(root, file);
  if (!existsSync(path)) throw new Error(`Missing required file: ${file}`);
  return readFileSync(path, 'utf8');
}

function readJson<T>(root: string, file: string): T {
  return JSON.parse(readRepoFile(root, file)) as T;
}

function extractYamlNumber(raw: string, key: string): number | null {
  const match = raw.match(new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'm'));
  return match ? Number(match[1]) : null;
}

function extractYamlScalar(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function extractActiveHandoffIssue(raw: string): number | null {
  const match = raw.match(/^Active implementation seam is issue #(\d+).*$/m);
  return match ? Number(match[1]) : null;
}

function contractProofCommands(contract: FolderaContract): string[] {
  if (Array.isArray(contract.required_local_proof)) return contract.required_local_proof;
  if (typeof contract.required_local_proof === 'string') {
    return contract.required_local_proof.split(/[;\n]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function requireArrayIncludes(failures: string[], label: string, actual: string[] | undefined, expected: string[]): void {
  const values = actual ?? [];
  for (const entry of expected) {
    if (!values.includes(entry)) failures.push(`${label} must include: ${entry}`);
  }
}

function requireArrayExcludes(failures: string[], label: string, actual: string[] | undefined, forbidden: string[]): void {
  const values = actual ?? [];
  for (const entry of forbidden) {
    if (values.includes(entry)) failures.push(`${label} must not include forbidden entry: ${entry}`);
  }
}

function requireClosedIssueDoNotReopen(failures: string[], handoff: string, buildOrder: string): void {
  const lines = buildOrder.split(/\r?\n/);
  for (const issue of REQUIRED_CLOSED_ISSUES) {
    const issueBlocks = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => new RegExp(`^\\s*- issue:\\s*${issue}\\s*$`).test(line))
      .map(({ index }) => {
        const next = lines.findIndex((line, nextIndex) => nextIndex > index && /^\s*- issue:\s*\d+\s*$/.test(line));
        return lines.slice(index, next === -1 ? lines.length : next).join('\n');
      });
    if (issueBlocks.length === 0 || !issueBlocks.some((body) => /(closed|completed|superseded)/i.test(body))) {
      failures.push(`FOLDERA_BUILD_ORDER.yaml must classify issue #${issue} as closed/completed/superseded.`);
    }
  }
  if (!handoff.includes('Issues #121, #99, #48, #131, #147, #151, #154, #159, #163, #166, #170, #173, and #175 are closed/completed/superseded. Do not reopen them.')) {
    failures.push('ACTIVE_HANDOFF.md must keep closed/completed/superseded issues, including #166, #170, and #173, out of scope.');
  }
}

function checkDraft(root: string): string[] {
  const failures: string[] = [];
  let draft = '';
  try {
    draft = readRepoFile(root, 'FOLDERA_MASTER_SYNTHESIS_DRAFT.md');
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  for (const marker of [
    '# READINESS VERDICT',
    'Authority status: `REFERENCE_DRAFT`.',
    'Verdict: build-bible ready as a reference draft.',
    'not implementation authority',
    '# CUSTOMER / ICP LOCK',
    '# $29 SELF-SERVE DELIVERABLE',
    '# FIRST USER JOURNEY',
    '# CURRENT REPO INVENTORY',
    '# PRODUCT OPERATING MODEL',
    '# TECHNICAL ARCHITECTURE MAP',
    '# SIGNAL FLOW',
    '# SUPABASE CURRENT/FUTURE SCHEMA MAP',
    '# VERCEL CONFIGURATION MAP',
    '# GITHUB WORKFLOW / REPO OS',
    '# BUILD LADDER TO MONEY-READY MVP',
    '# MONEY-READINESS THRESHOLD',
    '# FORBIDDEN WORK',
    '# STOP CONDITIONS',
    'hit-by-a-bus build bible',
    'customer / ICP',
    'buyer',
    '$29/month self-serve deliverable',
    'first user journey',
    'current repo inventory',
    'what exists',
    'what is missing',
    'React / Next / Tailwind frontend responsibilities',
    'backend/API responsibilities',
    'runtime brain',
    'signal flow',
    'Supabase current/future schema',
    'Vercel configuration map',
    'GitHub workflow',
    'issue/PR ladder',
    'proof gates',
    'money-readiness threshold',
    'forbidden work',
    'stop conditions',
  ]) {
    if (!draft.includes(marker)) failures.push(`FOLDERA_MASTER_SYNTHESIS_DRAFT.md is missing required marker: ${marker}`);
  }
  return failures;
}

function checkSourceTruth(root: string, handoff: string, buildOrder: string, contract: FolderaContract): string[] {
  const failures: string[] = [];
  const handoffIssue = extractActiveHandoffIssue(handoff);
  const buildIssue = extractYamlNumber(buildOrder, 'active_issue');
  const contractIssue = contract.active_issue ?? null;

  if (handoffIssue !== ACTIVE_ISSUE) failures.push(`ACTIVE_HANDOFF.md must assign active issue #${ACTIVE_ISSUE}; found ${handoffIssue ?? 'none'}.`);
  if (buildIssue !== ACTIVE_ISSUE) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be ${ACTIVE_ISSUE}; found ${buildIssue ?? 'none'}.`);
  if (contractIssue !== ACTIVE_ISSUE) failures.push(`.foldera-contract.json active_issue must be ${ACTIVE_ISSUE}; found ${contractIssue ?? 'none'}.`);
  if (contract.active !== true) failures.push(`.foldera-contract.json active must be true for issue #${ACTIVE_ISSUE}.`);
  if (contract.backlog_id !== 'ISSUE_179_RUNG_3_DETERMINISTIC_WORK_PACKET_FIXTURE_PROOF') failures.push('.foldera-contract.json backlog_id must resolve to issue #179 Rung 3 deterministic work-packet fixture proof.');
  if (contract.authority_status !== 'ACTIVE_RUNG_3_DETERMINISTIC_WORK_PACKET_FIXTURE_PROOF') failures.push('.foldera-contract.json authority_status must be ACTIVE_RUNG_3_DETERMINISTIC_WORK_PACKET_FIXTURE_PROOF.');
  if (contract.base_commit !== BASE_COMMIT) failures.push(`.foldera-contract.json base_commit must be PR #${RUNG_2_PR} merge SHA ${BASE_COMMIT}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'RUNG_3_DETERMINISTIC_WORK_PACKET_FIXTURE_PROOF') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be RUNG_3_DETERMINISTIC_WORK_PACKET_FIXTURE_PROOF; found ${priority ?? 'none'}.`);
  if (workType !== 'TEST_MODE_DETERMINISTIC_FIXTURE_PROOF') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be TEST_MODE_DETERMINISTIC_FIXTURE_PROOF; found ${workType ?? 'none'}.`);
  if (nextSeam !== NEXT_SEAM) failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must be ${NEXT_SEAM}; found ${nextSeam ?? 'none'}.`);

  for (const marker of [
    `Active implementation seam is issue #${ACTIVE_ISSUE}`,
    `Issue #${COMPLETED_RUNG_2_ISSUE} is complete via PR #${RUNG_2_PR}`,
    `Issue #${COMPLETED_FIRST_RUNG_ISSUE} is complete/superseded by PR #${FIRST_RUNG_PR}`,
    `Issue #${COMPLETED_MASTER_SYNTHESIS_ISSUE} is complete/superseded by PR #${MASTER_SYNTHESIS_PR}`,
    `Issue #${OPEN_THREADS_ISSUE} Open Threads remains capture-only and cannot authorize implementation.`,
    'This is a deterministic TEST_MODE work-packet fixture proof seam.',
    'FOLDERA_MASTER_SYNTHESIS_DRAFT.md` remains `REFERENCE_DRAFT`',
    'GitHub writeback is mandatory.',
    'One active seam only.',
    'Issue #140 / PR #142 remains rail-only and parked for this seam',
    'Issue #136 remains open as the standing Codex Run Ledger only.',
    'Exact lane: `tests/fixtures/work-packets/source-signals.ts` -> `lib/work-packets`',
    'Required proof chain: fixture signals enter; exactly one work packet is generated',
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }
  for (const staleMarker of [
    'Run issue #166 only',
    'Forbidden in issue #166',
    'Repo Intake Governor Command OS v0 files are authorized',
    'The only safe next move is manual evidence collection/recording',
    'Collect/manual-record real first-10 ICP evidence only',
  ]) {
    if (handoff.includes(staleMarker)) failures.push(`ACTIVE_HANDOFF.md still contains stale command: ${staleMarker}`);
  }

  for (const marker of [
    'required_issue_179_rung_3_deterministic_work_packet_fixture_proof',
    `controlling_issue: ${ACTIVE_ISSUE}`,
    'source_issue: 175',
    'source_pr: 177',
    'selected_first_evidence_lane: deterministic work-packet fixture lane',
    'selected_lane_entrypoint: tests/fixtures/work-packets/source-signals.ts',
    'selected_lane_receipt: lib/work-packets/receipt.ts',
    'selected_lane_state_transition: lib/work-packets/transitions.ts',
    'selected_lane_review_surface: lib/slack-test-mode/work-packet-review.ts',
    'proof_chain: fixture signals -> generated work_packet -> TEST_MODE review card -> review/dismiss -> packet/workday state after',
    'paid_model_call_required: false',
    'live_connector_fetch_required: false',
    'schema_implementation: forbidden',
    'data_mutation: forbidden',
  ]) {
    if (!buildOrder.includes(marker)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing required marker: ${marker}`);
  }
  if (!buildOrder.includes('status: completed_superseded') || !buildOrder.includes('reason: Repo Intake Governor Command OS v0 completed by PR #167 and is no longer active.')) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must classify issue #166 as completed_superseded because PR #167 merged.');
  }
  if (!buildOrder.includes('reason: Master Synthesis build bible REFERENCE_DRAFT completed by PR #172 and is no longer active.')) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must classify issue #170 as completed_superseded because PR #172 merged.');
  }
  if (!buildOrder.includes('reason: First executable MVP rung promotion completed by PR #174 and is no longer active.')) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must classify issue #173 as completed_superseded because PR #174 merged.');
  }
  if (!buildOrder.includes('reason: Rung 2 audit completed by PR #177 and selected deterministic work-packet fixture lane.')) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must classify issue #175 as closed_completed because PR #177 merged.');
  }
  for (const rung of [
    'Promote first executable MVP rung',
    'Audit current schema and choose first evidence lane',
    'Prove deterministic one-verdict fixture loop',
    'Prove one-click state mutation receipt',
    'Implement first user journey shell',
    'Persist one source-backed workday state path',
    'Prove trust/privacy/no-send rail',
    'Add bounded $29 early-access/payment path',
    'Prove money-ready MVP end to end',
    'Prove first non-owner validation',
  ]) {
    if (!buildOrder.includes(`- ${rung}`)) failures.push(`FOLDERA_BUILD_ORDER.yaml build sequence must include: ${rung}`);
  }

  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayExcludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);
  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);

  for (const marker of [
    'current seam is Rung 3 deterministic one-verdict fixture loop proof',
    'fixture signals -> generated work_packet -> TEST_MODE review card -> review/dismiss -> packet/workday state after',
    'paid_model_call_required is false',
    'live_connector_fetch_required is false',
    'issue #175 remains completed by PR #177',
    'issue #140 / PR #142 remains parked rail-only',
  ]) {
    if (!contract.acceptance_condition?.includes(marker)) failures.push(`.foldera-contract.json acceptance_condition is missing: ${marker}`);
  }
  if (!contract.next_command?.includes('stop')) failures.push('.foldera-contract.json next_command must stop after issue #179 closes.');

  const sourceMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  for (const marker of [
    '| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` |',
    '| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |',
    '| `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `REFERENCE_DRAFT` |',
    'GitHub issue #179 `Rung 3: prove deterministic work-packet fixture loop`',
    'GitHub issue #175 `Rung 2: audit current schema and choose first evidence lane` | `REFERENCE_ONLY`',
    '| `docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md` | `CURRENT_CONTROL` |',
    'selects deterministic work-packet fixture lane for issue #179',
    'GitHub issue #173 `Promote first executable MVP rung from Master Synthesis` | `REFERENCE_ONLY`',
    'GitHub issue #170 `Foldera Master Synthesis Lock Pass - customer, deliverable, build spec, and issue ladder` | `REFERENCE_ONLY`',
    'GitHub issue #166 `Repo Intake Governor v0 - classify owner input into repo truth` | `REFERENCE_ONLY`',
    'GitHub issue #165 `Open Threads - Foldera Owner Whiteboard`',
    'Open Threads captures raw thoughts; it does not authorize implementation.',
  ]) {
    if (!sourceMap.includes(marker)) failures.push(`docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: ${marker}`);
  }

  const northStar = readRepoFile(root, 'FOLDERA_NORTH_STAR_LOCK.md');
  if (!northStar.includes('Foldera is a Workday Presence Layer')) failures.push('FOLDERA_NORTH_STAR_LOCK.md must preserve Workday Presence Layer doctrine.');

  const productOs = readRepoFile(root, 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md');
  if (!productOs.includes('Repo Intake Governor v0')) failures.push('FOLDERA_PRODUCT_OPERATING_SYSTEM.md must retain completed Command OS context.');

  const rung2Audit = readRepoFile(root, 'docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md');
  for (const marker of [
    'Authority status: `ISSUE_175_READ_ONLY_AUDIT_ARTIFACT`.',
    'Selected first evidence lane for Rung 3: deterministic work-packet fixture lane.',
    'Lane selection status: `SELECTED`.',
    'tests/fixtures/work-packets/source-signals.ts',
    'buildWorkPacketBrainReceipt',
    'No product/runtime implementation',
  ]) {
    if (!rung2Audit.includes(marker)) failures.push(`docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md is missing required marker: ${marker}`);
  }

  failures.push(...checkDraft(root));
  return failures;
}

export function runSourceTruthCheck(root = process.cwd()): string[] {
  const failures: string[] = [];
  let handoff = '';
  let buildOrder = '';
  let contract: FolderaContract | null = null;

  try {
    handoff = readRepoFile(root, 'ACTIVE_HANDOFF.md');
    buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
    contract = readJson<FolderaContract>(root, '.foldera-contract.json');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) return failures;
  return checkSourceTruth(root, handoff, buildOrder, contract as FolderaContract);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runSourceTruthCheck(process.cwd());
  if (failures.length > 0) {
    console.error('Source truth check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Source truth check passed. Issue #179 is active, issue #175 is completed by PR #177, and Rung 3 is the active deterministic fixture proof seam.');
}
