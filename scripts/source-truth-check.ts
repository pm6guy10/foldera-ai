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

const ACTIVE_ISSUE = 168;
const OPEN_THREADS_ISSUE = 165;
const COMPLETED_COMMAND_OS_ISSUE = 166;
const COMPLETED_COMMAND_OS_PR = 167;
const COMPLETED_PRODUCT_OS_ISSUE = 163;
const PRODUCT_OS_PR = 164;
const BASE_COMMIT = 'a624b49f1f6e28f1c422624d001e072745f2e4bd';
const NEXT_SEAM = 'Implement or operationalize issue #168 automatic ChatGPT-to-GitHub capture/retrieval behavior';

const REQUIRED_PROOF_COMMANDS = [
  'npm run gate:command',
  'npm run gate:continuity',
  'git diff --check',
  'npx vitest run tests/config/__tests__/source-truth-check.test.ts tests/config/__tests__/continuity-gate.test.ts --reporter=verbose',
];

const REQUIRED_ALLOWED_FILES = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'scripts/source-truth-check.ts',
  'scripts/continuity-gate.ts',
  'tests/config/__tests__/source-truth-check.test.ts',
  'tests/config/__tests__/continuity-gate.test.ts',
];

const FORBIDDEN_PRODUCT_PATHS = [
  'app/**',
  'components/**',
  'app/api/slack/**',
  'lib/slack/**',
  'supabase/**',
  'app/dashboard/**',
  'components/dashboard/**',
  'lib/auth/**',
  'app/api/auth/**',
  'app/api/stripe/**',
  'lib/stripe/**',
  'lib/billing/**',
  'package.json',
  'package-lock.json',
  'outreach',
  'scraping',
  'paid ads',
  'customer data mutation',
  'fake enterprise claims',
  'fake compliance claims',
  'broad cleanup',
];

const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 151, 154, 159, COMPLETED_PRODUCT_OS_ISSUE, COMPLETED_COMMAND_OS_ISSUE];

const REQUIRED_PRODUCT_OS_MARKERS = [
  '`CURRENT_CONTROL`',
  'Foldera is a Workday Presence Layer.',
  'state + connectors + triggers + one intervention',
  'one trusted next move, or safe silence',
  'Enterprise-ready is not a 1-3 week claim.',
  'Repo Intake Governor v0',
  '`FOLDERA_NORTH_STAR_LOCK.md` controls product doctrine.',
  '`FOLDERA_PRODUCT_OPERATING_SYSTEM.md` for roadmap, phase order, backlog lanes, business roadmap, and enterprise path.',
];

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
  return match ? match[1].trim().replace(/^[ '\"]+|[ '\"]+$/g, '') : null;
}

function extractYamlList(raw: string, key: string): string[] {
  const lines = raw.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  if (startIndex === -1) return [];
  const values: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith('  - ')) break;
    values.push(line.slice(4).trim());
  }
  return values;
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

function requireClosedIssueDoNotReopen(failures: string[], handoff: string, buildOrder: string): void {
  for (const issue of REQUIRED_CLOSED_ISSUES) {
    const pattern = new RegExp(`issue:\\s*${issue}[\\s\\S]*?(closed|completed|superseded)`, 'i');
    if (!pattern.test(buildOrder)) failures.push(`FOLDERA_BUILD_ORDER.yaml must classify issue #${issue} as closed/completed/superseded.`);
  }
  for (const marker of [
    'Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.',
    `Issue #${COMPLETED_PRODUCT_OS_ISSUE} / PR #${PRODUCT_OS_PR} completed the Product Operating System.`,
    `Issue #${COMPLETED_COMMAND_OS_ISSUE} / PR #${COMPLETED_COMMAND_OS_PR} completed Repo Intake Governor Command OS v0.`,
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing closed/superseded marker: ${marker}`);
  }
}

function checkProductOperatingSystem(root: string): string[] {
  const failures: string[] = [];
  let productOs = '';
  try {
    productOs = readRepoFile(root, 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md');
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  for (const marker of REQUIRED_PRODUCT_OS_MARKERS) {
    if (!productOs.includes(marker)) failures.push(`FOLDERA_PRODUCT_OPERATING_SYSTEM.md is missing required marker: ${marker}`);
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
  if (contract.backlog_id !== 'ISSUE_168_COMMAND_OS_AUTO_CAPTURE') failures.push('.foldera-contract.json backlog_id must resolve to issue #168 Command OS auto capture.');
  if (contract.authority_status !== 'ACTIVE_COMMAND_OS_AUTO_CAPTURE') failures.push('.foldera-contract.json authority_status must be ACTIVE_COMMAND_OS_AUTO_CAPTURE.');
  if (contract.base_commit !== BASE_COMMIT) failures.push(`.foldera-contract.json base_commit must be PR #167 merge SHA ${BASE_COMMIT}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'COMMAND_OS_AUTO_CAPTURE') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be COMMAND_OS_AUTO_CAPTURE; found ${priority ?? 'none'}.`);
  if (workType !== 'SOURCE_TRUTH_CLOSEOUT_AND_SWITCHBOARD_ASSIGNMENT') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_TRUTH_CLOSEOUT_AND_SWITCHBOARD_ASSIGNMENT; found ${workType ?? 'none'}.`);
  if (nextSeam !== NEXT_SEAM) failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must be ${NEXT_SEAM}; found ${nextSeam ?? 'none'}.`);

  const sourceOrder = extractYamlList(buildOrder, 'source_of_truth_order');
  for (const entry of ['FOLDERA_NORTH_STAR_LOCK.md', 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md', 'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md']) {
    if (!sourceOrder.includes(entry)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_of_truth_order entry: ${entry}`);
  }

  for (const marker of [
    `Active implementation seam is issue #${ACTIVE_ISSUE}`,
    `Issue #${COMPLETED_COMMAND_OS_ISSUE} / PR #${COMPLETED_COMMAND_OS_PR} completed Repo Intake Governor Command OS v0.`,
    `Issue #${COMPLETED_PRODUCT_OS_ISSUE} / PR #${PRODUCT_OS_PR} completed the Product Operating System.`,
    `Open Threads issue #${OPEN_THREADS_ISSUE} is the raw-input inbox, not implementation authority.`,
    'This is a source-truth / assistant-switchboard seam, not product runtime work.',
    'GitHub writeback is mandatory.',
    'One active seam only.',
    'Issue #140 / PR #142 remains rail-only and parked externally blocked',
    'Issue #136 remains open as the standing Codex Run Ledger only.',
    'comments are not law',
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }
  for (const staleMarker of ['Run issue #166 only on branch', 'Create one draft PR that transitions source truth', 'ACTIVE_REPO_INTAKE_GOVERNOR_COMMAND_OS']) {
    if (handoff.includes(staleMarker)) failures.push(`ACTIVE_HANDOFF.md still contains stale issue #166 command: ${staleMarker}`);
  }

  for (const marker of [
    'required_issue_168_command_os_v1',
    `controlling_issue: ${ACTIVE_ISSUE}`,
    `open_threads_issue: ${OPEN_THREADS_ISSUE}`,
    `completed_command_os_v0_issue: ${COMPLETED_COMMAND_OS_ISSUE}`,
    'comments_are_not_law: true',
    'issue_body_is_not_enough: true',
    'one_and_done_requirement:',
    'open_threads_authority: capture only; not implementation authority',
    'product_runtime_touched: forbidden',
    'slack_pr_142_status: parked rail-only externally blocked',
  ]) {
    if (!buildOrder.includes(marker)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing required marker: ${marker}`);
  }

  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);

  if (!contract.acceptance_condition?.includes('comments are not law')) {
    failures.push('.foldera-contract.json acceptance_condition must state comments are not law.');
  }
  if (!contract.acceptance_condition?.includes('one-and-done ChatGPT-to-GitHub capture/retrieval proof')) {
    failures.push('.foldera-contract.json acceptance_condition must require one-and-done ChatGPT-to-GitHub capture/retrieval proof.');
  }
  if (!contract.next_command?.includes(`Run issue #${ACTIVE_ISSUE} only`)) failures.push(`.foldera-contract.json next_command must command issue #${ACTIVE_ISSUE} only.`);

  failures.push(...checkProductOperatingSystem(root));

  const northStar = readRepoFile(root, 'FOLDERA_NORTH_STAR_LOCK.md');
  if (!northStar.includes('`CURRENT_CONTROL`')) failures.push('FOLDERA_NORTH_STAR_LOCK.md must remain CURRENT_CONTROL.');
  if (!northStar.includes('Foldera is a Workday Presence Layer')) failures.push('FOLDERA_NORTH_STAR_LOCK.md must preserve Workday Presence Layer doctrine.');

  const sourceMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  for (const marker of [
    '| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` |',
    '| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |',
    '| `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` | `PROOF_GATE` |',
    '| `FOLDERA_LAUNCH_ROADMAP.md` | `REFERENCE_ONLY` |',
    'GitHub issue #168 `Command OS v1 - automatic Open Threads capture from ChatGPT`',
    'GitHub issue #166 `Repo Intake Governor v0 - classify owner input into repo truth` | `PROOF_GATE`',
    'Open Threads captures raw thoughts; it does not authorize implementation.',
    'Comments, labels, GitHub Projects, and Open Threads capture are not law unless source-truth files and gates make them enforceable.',
  ]) {
    if (!sourceMap.includes(marker)) failures.push(`docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: ${marker}`);
  }

  const tracker = readRepoFile(root, 'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md');
  if (!tracker.includes('# First 10 ICP Evidence Tracker')) failures.push('docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md must exist as the completed issue #159 tracker.');

  const prTemplate = readRepoFile(root, '.github/pull_request_template.md');
  if (!prTemplate.includes('- `FOLDERA_NORTH_STAR_LOCK.md`: cited / updated / unchanged - reason / not applicable - reason')) {
    failures.push('.github/pull_request_template.md must include the North Star traceability row.');
  }
  if (!prTemplate.includes('- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`: cited / updated / unchanged - reason / not applicable - reason')) {
    failures.push('.github/pull_request_template.md must include the Product Operating System traceability row.');
  }

  return failures;
}

export function runSourceTruthCheck(root = process.cwd()): string[] {
  const failures: string[] = [];
  let handoff = '';
  let buildOrder = '';
  let contract: FolderaContract | null = null;

  try {
    handoff = readRepoFile(root, 'ACTIVE_HANDOFF.md');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
    buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  try {
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

  console.log('Source truth check passed. Issue #168 is active, issue #166 / PR #167 is complete, comments are not law, and Command OS v1 auto-capture proof is required.');
}
