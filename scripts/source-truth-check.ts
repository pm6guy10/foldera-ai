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

const ACTIVE_ISSUE = 163;
const BASE_COMMIT = 'ca34870af4190e1e719ab55a93f4159297eb4135';
const NEXT_SEAM = 'Repo Intake Governor v0';

const REQUIRED_PROOF_COMMANDS = ['npm run gate:command', 'npm run gate:continuity', 'npm run lint', 'git diff --check'];
const REQUIRED_ALLOWED_FILES = [
  '.foldera-contract.json',
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_PRODUCT_OPERATING_SYSTEM.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  '.github/pull_request_template.md',
  'scripts/continuity-gate.ts',
  'scripts/source-truth-check.ts',
  'tests/config/__tests__/source-truth-check.test.ts',
  'tests/config/__tests__/continuity-gate.test.ts',
];
const FORBIDDEN_PRODUCT_PATHS = [
  'components/foldera/LandingPage.tsx',
  'app/page.tsx',
  'next.config.mjs',
  'app/api/slack/**',
  'lib/slack/**',
  'lib/slack-test-mode/**',
  'lib/workday-presence/source-backed-state.ts',
  'lib/workday-presence/__tests__/source-backed-state.test.ts',
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
];
const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 151, 159];
const REQUIRED_PRODUCT_OS_SECTIONS = [
  '## Authority status',
  '## 1. Executive verdict',
  '## 2. The holy-crap moment',
  '## 3. Core product loop',
  '## 4. Current repo state',
  '## 5. Product non-goals',
  '## 6. Phase ladder from today to enterprise-ready',
  '## 7. Product backlog lanes',
  '## 8. Business roadmap',
  '## 9. Enterprise-ready definition',
  '## 10. Owner-burden rule',
  '## 11. Manual first-10 evidence status',
  '## 12. Source-truth authority',
  '## 13. Next-seam recommendation',
];
const REQUIRED_PRODUCT_OS_MARKERS = [
  '`CURRENT_CONTROL`',
  'Foldera is a Workday Presence Layer.',
  'state + connectors + triggers + one intervention',
  'one trusted next move, or safe silence',
  'Enterprise-ready is not a 1-3 week claim.',
  'Manual first-10 evidence remains proof doctrine but is owner-rejected as the primary executable path.',
  'Placeholder tracker rows are not evidence.',
  'Repo Intake Governor v0',
  'Do not let the repo remain blocked on manual first-10 evidence as the only executable next move.',
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
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
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
  const lines = buildOrder.split(/\r?\n/);
  for (const issue of REQUIRED_CLOSED_ISSUES) {
    const start = lines.findIndex((line) => new RegExp(`^\\s*- issue:\\s*${issue}\\s*$`).test(line));
    const next = start === -1 ? -1 : lines.findIndex((line, index) => index > start && /^\s*- issue:\s*\d+\s*$/.test(line));
    const body = start === -1 ? '' : lines.slice(start, next === -1 ? lines.length : next).join('\n');
    if (!/(closed|completed|superseded)/i.test(body)) {
      failures.push(`FOLDERA_BUILD_ORDER.yaml must classify issue #${issue} as closed/completed/superseded.`);
    }
  }
  if (!handoff.includes('Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.')) {
    failures.push('ACTIVE_HANDOFF.md must state #121, #131, #99, and #48 are closed/superseded/completed and must not be reopened.');
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
  for (const section of REQUIRED_PRODUCT_OS_SECTIONS) {
    if (!productOs.includes(section)) failures.push(`FOLDERA_PRODUCT_OPERATING_SYSTEM.md is missing required section: ${section}`);
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
  if (contract.active !== true) failures.push('.foldera-contract.json active must be true for issue #163.');
  if (contract.backlog_id !== 'ISSUE_163_PRODUCT_OPERATING_SYSTEM_ROADMAP_LOCK') failures.push('.foldera-contract.json backlog_id must resolve to issue #163 Product Operating System.');
  if (contract.authority_status !== 'ACTIVE_PRODUCT_OPERATING_SYSTEM_ROADMAP_LOCK') failures.push('.foldera-contract.json authority_status must be ACTIVE_PRODUCT_OPERATING_SYSTEM_ROADMAP_LOCK.');
  if (contract.base_commit !== BASE_COMMIT) failures.push(`.foldera-contract.json base_commit must be PR #162 merge SHA ${BASE_COMMIT}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'PRODUCT_OPERATING_SYSTEM_ROADMAP_LOCK') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be PRODUCT_OPERATING_SYSTEM_ROADMAP_LOCK; found ${priority ?? 'none'}.`);
  if (workType !== 'SOURCE_TRUTH_ROADMAP_RECONCILIATION') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_TRUTH_ROADMAP_RECONCILIATION; found ${workType ?? 'none'}.`);
  if (nextSeam !== NEXT_SEAM) failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must be ${NEXT_SEAM}; found ${nextSeam ?? 'none'}.`);

  const sourceOrder = extractYamlList(buildOrder, 'source_of_truth_order');
  for (const entry of ['FOLDERA_NORTH_STAR_LOCK.md', 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md', 'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md']) {
    if (!sourceOrder.includes(entry)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_of_truth_order entry: ${entry}`);
  }

  for (const marker of [
    'Active implementation seam is issue #163',
    'This is a docs/source-truth seam only.',
    'Manual first-10 evidence remains proof doctrine/reference, but it is owner-rejected as the primary operating path and is no longer the only executable next move.',
    'Issue #140 / PR #142 remains rail-only and parked externally blocked',
    'Issue #136 remains open as the standing Codex Run Ledger only.',
    '`FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.',
    'Placeholder rows in `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md` are not evidence.',
    'Next seam after this PR: Repo Intake Governor v0.',
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }
  for (const staleMarker of [
    'The only safe next move is manual evidence collection/recording',
    'Collect/manual-record real first-10 ICP evidence only',
  ]) {
    if (handoff.includes(staleMarker)) failures.push(`ACTIVE_HANDOFF.md still contains stale manual-first-10-only command: ${staleMarker}`);
  }

  for (const marker of [
    'required_issue_163_product_operating_system',
    'post_159_reconciliation',
    'manual_first_10_status: owner-rejected as primary operating path',
    'next_seam_after_issue_163: Repo Intake Governor v0',
    'preserve FOLDERA_NORTH_STAR_LOCK.md as product doctrine control',
    'preserve docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md as proof doctrine/reference',
  ]) {
    if (!buildOrder.includes(marker)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing required marker: ${marker}`);
  }

  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);

  if (!contract.acceptance_condition?.includes('FOLDERA_PRODUCT_OPERATING_SYSTEM.md exists as CURRENT_CONTROL')) {
    failures.push('.foldera-contract.json acceptance_condition must require the Product Operating System artifact.');
  }
  if (!contract.acceptance_condition?.includes('exactly one next seam is named as Repo Intake Governor v0')) {
    failures.push('.foldera-contract.json acceptance_condition must name Repo Intake Governor v0 as the next seam.');
  }
  if (!contract.next_command?.includes('Complete issue #163 only')) failures.push('.foldera-contract.json next_command must command issue #163 only.');

  if (!readRepoFile(root, 'AGENTS.md').includes('## MANDATORY CODEX RUN LEDGER CLOSEOUT')) failures.push('AGENTS.md must contain MANDATORY CODEX RUN LEDGER CLOSEOUT.');

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
  ]) {
    if (!sourceMap.includes(marker)) failures.push(`docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: ${marker}`);
  }

  const tracker = readRepoFile(root, 'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md');
  if (!tracker.includes('# First 10 ICP Evidence Tracker')) failures.push('docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md must exist as the completed issue #159 tracker.');
  if (!tracker.includes('This tracker cites and obeys `FOLDERA_NORTH_STAR_LOCK.md`.')) failures.push('docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md must cite the North Star Lock.');

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

  console.log('Source truth check passed. Issue #163 is active, the Product Operating System controls roadmap/phase/backlog/enterprise path, first-10 evidence remains proof doctrine/reference, and the next seam is Repo Intake Governor v0.');
}
