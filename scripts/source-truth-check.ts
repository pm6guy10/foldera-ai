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

type PackageJson = {
  scripts?: Record<string, string>;
};

const ACTIVE_ISSUE = 166;
const OPEN_THREADS_ISSUE = 165;
const COMPLETED_PRODUCT_OS_ISSUE = 163;
const PRODUCT_OS_PR = 164;
const BASE_COMMIT = 'ab0eb73f08c459af81e5bc5aa4680235410ad552';
const NEXT_SEAM = "Run Repo Intake Governor against Brandon's next messy Foldera input";

const REQUIRED_PROOF_COMMANDS = [
  'npm run health',
  'npm run gate:command',
  'npm run gate:continuity',
  'npm run lint',
  'npm run build',
  'git diff --check',
  'npm run gate:repo-intake-governor',
  'npx vitest run tests/config/__tests__/source-truth-check.test.ts tests/config/__tests__/continuity-gate.test.ts --reporter=verbose',
];

const REQUIRED_ALLOWED_FILES = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  '.github/pull_request_template.md',
  'scripts/source-truth-check.ts',
  'scripts/continuity-gate.ts',
  'scripts/repo-intake-governor.ts',
  'lib/repo-intake-governor/**',
  'tests/repo-intake-governor/**',
  'tests/fixtures/repo-intake-governor/**',
  'tests/config/__tests__/**',
  'package.json',
];

const FORBIDDEN_PRODUCT_PATHS = [
  'app/**',
  'components/**',
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
  'app/api/google/**',
  'app/api/microsoft/**',
  'app/api/stripe/**',
  'lib/stripe/**',
  'lib/billing/**',
  'package-lock.json',
  'Dependabot',
  'Slack app settings',
  'Vercel settings',
  'connector platform expansion',
  'Teams expansion',
  'email expansion',
  'calendar expansion',
  'outreach',
  'scraping',
  'paid ads',
  'customer data mutation',
  'fake enterprise claims',
  'fake compliance claims',
  'broad cleanup',
];

const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 151, 154, 159, COMPLETED_PRODUCT_OS_ISSUE];

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
  for (const marker of [
    'Issues #121, #99, and #48 are closed/superseded; issue #131 is closed/completed. Do not reopen them.',
    'Issue #154 source-truth selection is closed/completed and must not compete with issue #166.',
    `Issue #${COMPLETED_PRODUCT_OS_ISSUE} / PR #${PRODUCT_OS_PR} completed the Product Operating System.`,
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
  for (const section of REQUIRED_PRODUCT_OS_SECTIONS) {
    if (!productOs.includes(section)) failures.push(`FOLDERA_PRODUCT_OPERATING_SYSTEM.md is missing required section: ${section}`);
  }
  for (const marker of REQUIRED_PRODUCT_OS_MARKERS) {
    if (!productOs.includes(marker)) failures.push(`FOLDERA_PRODUCT_OPERATING_SYSTEM.md is missing required marker: ${marker}`);
  }
  return failures;
}

function checkPackageScripts(root: string): string[] {
  const failures: string[] = [];
  const packageJson = readJson<PackageJson>(root, 'package.json');
  if (packageJson.scripts?.['governor:intake'] !== 'npx tsx scripts/repo-intake-governor.ts') {
    failures.push('package.json must define scripts.governor:intake as npx tsx scripts/repo-intake-governor.ts.');
  }
  if (!packageJson.scripts?.['gate:repo-intake-governor']) {
    failures.push('package.json must define scripts.gate:repo-intake-governor for Command OS proof.');
  } else if (!packageJson.scripts['gate:repo-intake-governor'].includes('tests/repo-intake-governor')) {
    failures.push('package.json scripts.gate:repo-intake-governor must run focused Repo Intake Governor tests.');
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
  if (contract.backlog_id !== 'ISSUE_166_REPO_INTAKE_GOVERNOR_COMMAND_OS') failures.push('.foldera-contract.json backlog_id must resolve to issue #166 Repo Intake Governor Command OS.');
  if (contract.authority_status !== 'ACTIVE_REPO_INTAKE_GOVERNOR_COMMAND_OS') failures.push('.foldera-contract.json authority_status must be ACTIVE_REPO_INTAKE_GOVERNOR_COMMAND_OS.');
  if (contract.base_commit !== BASE_COMMIT) failures.push(`.foldera-contract.json base_commit must be PR #164 merge SHA ${BASE_COMMIT}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'REPO_INTAKE_GOVERNOR_COMMAND_OS') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be REPO_INTAKE_GOVERNOR_COMMAND_OS; found ${priority ?? 'none'}.`);
  if (workType !== 'COMMAND_OS_IMPLEMENTATION') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be COMMAND_OS_IMPLEMENTATION; found ${workType ?? 'none'}.`);
  if (nextSeam !== NEXT_SEAM) failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must be ${NEXT_SEAM}; found ${nextSeam ?? 'none'}.`);

  const sourceOrder = extractYamlList(buildOrder, 'source_of_truth_order');
  for (const entry of ['FOLDERA_NORTH_STAR_LOCK.md', 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md', 'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md']) {
    if (!sourceOrder.includes(entry)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_of_truth_order entry: ${entry}`);
  }

  for (const marker of [
    `Active implementation seam is issue #${ACTIVE_ISSUE}`,
    `Issue #${COMPLETED_PRODUCT_OS_ISSUE} / PR #${PRODUCT_OS_PR} completed the Product Operating System.`,
    `Open Threads issue #${OPEN_THREADS_ISSUE} is the raw-input inbox, not implementation authority.`,
    'This is a repo-local deterministic Command OS seam.',
    'GitHub writeback is mandatory.',
    'One active seam only.',
    'Issue #140 / PR #142 remains rail-only and parked externally blocked',
    'Issue #136 remains open as the standing Codex Run Ledger only.',
    '`FOLDERA_PRODUCT_OPERATING_SYSTEM.md` controls roadmap, phase order, backlog lanes, and enterprise path.',
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }
  for (const staleMarker of ['Run issue #163 only', 'Forbidden in issue #163', 'no Repo Intake Governor implementation started']) {
    if (handoff.includes(staleMarker)) failures.push(`ACTIVE_HANDOFF.md still contains stale issue #163 command: ${staleMarker}`);
  }
  for (const staleMarker of [
    'The only safe next move is manual evidence collection/recording',
    'Collect/manual-record real first-10 ICP evidence only',
  ]) {
    if (handoff.includes(staleMarker)) failures.push(`ACTIVE_HANDOFF.md still contains stale manual-first-10-only command: ${staleMarker}`);
  }

  for (const marker of [
    'required_issue_166_repo_intake_governor',
    `controlling_issue: ${ACTIVE_ISSUE}`,
    `open_threads_issue: ${OPEN_THREADS_ISSUE}`,
    `product_operating_system_completed_issue: ${COMPLETED_PRODUCT_OS_ISSUE}`,
    'command_os_v0_authorized: true',
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

  if (!contract.acceptance_condition?.includes('deterministic repo-local intake routing')) {
    failures.push('.foldera-contract.json acceptance_condition must require deterministic repo-local intake routing.');
  }
  if (!contract.acceptance_condition?.includes('Open Threads is capture-only')) {
    failures.push('.foldera-contract.json acceptance_condition must keep Open Threads capture-only.');
  }
  if (!contract.next_command?.includes(`Run issue #${ACTIVE_ISSUE} only`)) failures.push(`.foldera-contract.json next_command must command issue #${ACTIVE_ISSUE} only.`);

  failures.push(...checkPackageScripts(root));
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
    'GitHub issue #165 `Open Threads - Foldera Owner Whiteboard`',
    'GitHub issue #166 `Repo Intake Governor v0 - classify owner input into repo truth`',
    'Open Threads captures raw thoughts; it does not authorize implementation.',
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

  console.log('Source truth check passed. Issue #166 is active, Open Threads #165 is capture-only, Command OS v0 files are authorized, and Repo Intake Governor proof scripts are wired.');
}
