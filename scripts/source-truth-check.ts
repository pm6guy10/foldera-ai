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

const ACTIVE_ISSUE = 170;
const OPEN_THREADS_ISSUE = 165;
const COMPLETED_COMMAND_OS_ISSUE = 166;
const COMMAND_OS_PR = 167;
const REFERENCE_LOCK_PR = 171;
const BASE_COMMIT = '32b8764413420bdbc1aa432ce97bb09f0dcd7df4';
const NEXT_SEAM = 'Promote the first executable build rung from FOLDERA_MASTER_SYNTHESIS_DRAFT.md under a future explicitly assigned issue';

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
  'FOLDERA_MASTER_SYNTHESIS_DRAFT.md',
  'scripts/source-truth-check.ts',
  'tests/config/__tests__/**',
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
  'package.json',
  'package-lock.json',
  'Dependabot',
  'Vercel settings',
  'Slack app settings',
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

const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 151, 154, 159, 163, COMPLETED_COMMAND_OS_ISSUE];

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
  if (!handoff.includes('Issues #121, #99, #48, #131, #147, #151, #154, #159, #163, and #166 are closed/completed/superseded. Do not reopen them.')) {
    failures.push('ACTIVE_HANDOFF.md must keep closed/completed/superseded issues, including #166, out of scope.');
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
  if (contract.backlog_id !== 'ISSUE_170_MASTER_SYNTHESIS_BUILD_BIBLE_LOCK') failures.push('.foldera-contract.json backlog_id must resolve to issue #170 Master Synthesis Build Bible Lock.');
  if (contract.authority_status !== 'ACTIVE_MASTER_SYNTHESIS_REFERENCE_DRAFT_LOCK') failures.push('.foldera-contract.json authority_status must be ACTIVE_MASTER_SYNTHESIS_REFERENCE_DRAFT_LOCK.');
  if (contract.base_commit !== BASE_COMMIT) failures.push(`.foldera-contract.json base_commit must be PR #${REFERENCE_LOCK_PR} merge SHA ${BASE_COMMIT}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'MASTER_SYNTHESIS_BUILD_BIBLE_LOCK') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be MASTER_SYNTHESIS_BUILD_BIBLE_LOCK; found ${priority ?? 'none'}.`);
  if (workType !== 'SOURCE_TRUTH_BUILD_DEFINITION') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_TRUTH_BUILD_DEFINITION; found ${workType ?? 'none'}.`);
  if (nextSeam !== NEXT_SEAM) failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must be ${NEXT_SEAM}; found ${nextSeam ?? 'none'}.`);

  for (const marker of [
    `Active implementation seam is issue #${ACTIVE_ISSUE}`,
    `Issue #${COMPLETED_COMMAND_OS_ISSUE} / PR #${COMMAND_OS_PR} completed the Repo Intake Governor Command OS v0 and is superseded as the active seam.`,
    `Issue #${OPEN_THREADS_ISSUE} Open Threads remains capture-only and cannot authorize implementation.`,
    'This is a source-truth build-definition seam only.',
    'build-bible-ready `REFERENCE_DRAFT`',
    'GitHub writeback is mandatory.',
    'One active seam only.',
    'Issue #140 / PR #142 remains rail-only and parked externally blocked',
    'Issue #136 remains open as the standing Codex Run Ledger only.',
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
    'required_issue_170_master_synthesis_build_bible_lock',
    `controlling_issue: ${ACTIVE_ISSUE}`,
    'artifact: FOLDERA_MASTER_SYNTHESIS_DRAFT.md',
    'authority_status: REFERENCE_DRAFT',
    'readiness_verdict: BUILD_BIBLE_READY_REFERENCE_DRAFT',
    'implementation_authority: forbidden',
    'next_pass_required: first executable build rung under future explicitly assigned issue',
    'issue_166_status: completed_superseded_by_pr_167',
    'open_threads_issue_165_status: capture_only',
    'pr_142_status: parked_rail_only',
    'issue_136_status: ledger_only',
    'product_runtime_touched: forbidden',
  ]) {
    if (!buildOrder.includes(marker)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing required marker: ${marker}`);
  }
  if (!buildOrder.includes('status: completed_superseded') || !buildOrder.includes('reason: Repo Intake Governor Command OS v0 completed by PR #167 and is no longer active.')) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must classify issue #166 as completed_superseded because PR #167 merged.');
  }

  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayExcludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);
  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);

  if (!contract.acceptance_condition?.includes('FOLDERA_MASTER_SYNTHESIS_DRAFT.md exists as REFERENCE_DRAFT')) {
    failures.push('.foldera-contract.json acceptance_condition must require the Master Synthesis draft as REFERENCE_DRAFT.');
  }
  if (!contract.acceptance_condition?.includes('build-bible-ready REFERENCE_DRAFT')) {
    failures.push('.foldera-contract.json acceptance_condition must require the build-bible-ready REFERENCE_DRAFT verdict.');
  }
  if (!contract.acceptance_condition?.includes('explicitly forbids implementation authority')) {
    failures.push('.foldera-contract.json acceptance_condition must forbid treating the draft as implementation authority.');
  }
  if (!contract.next_command?.includes(`Run issue #${ACTIVE_ISSUE} only`)) failures.push(`.foldera-contract.json next_command must command issue #${ACTIVE_ISSUE} only.`);

  const sourceMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  for (const marker of [
    '| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` |',
    '| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |',
    '| `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `REFERENCE_DRAFT` |',
    'GitHub issue #170 `Foldera Master Synthesis Lock Pass - customer, deliverable, build spec, and issue ladder`',
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

  console.log('Source truth check passed. Issue #170 is active and FOLDERA_MASTER_SYNTHESIS_DRAFT.md is build-bible-ready as REFERENCE_DRAFT, not implementation authority.');
}
