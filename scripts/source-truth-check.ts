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

const ACTIVE_ISSUE = 151;
const BASE_SHA = '313df387c993c77660217008f973b1d48d3aa09f';

const REQUIRED_PROOF_COMMANDS = ['npm run gate:command', 'npm run gate:continuity', 'npm run lint', 'git diff --check'];
const REQUIRED_ALLOWED_FILES = [
  '.foldera-contract.json',
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
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
const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147];

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

function checkSourceTruth(root: string, handoff: string, buildOrder: string, contract: FolderaContract): string[] {
  const failures: string[] = [];
  const handoffIssue = extractActiveHandoffIssue(handoff);
  const buildIssue = extractYamlNumber(buildOrder, 'active_issue');
  const contractIssue = contract.active_issue ?? null;

  if (handoffIssue !== ACTIVE_ISSUE) failures.push(`ACTIVE_HANDOFF.md must name active issue #${ACTIVE_ISSUE}; found ${handoffIssue ?? 'none'}.`);
  if (buildIssue !== ACTIVE_ISSUE) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be ${ACTIVE_ISSUE}; found ${buildIssue ?? 'none'}.`);
  if (contractIssue !== ACTIVE_ISSUE) failures.push(`.foldera-contract.json active_issue must be ${ACTIVE_ISSUE}; found ${contractIssue ?? 'none'}.`);
  if (contract.backlog_id !== 'ISSUE_151_SOURCE_BACKED_RIGHT_NOW_SELECTOR') failures.push('.foldera-contract.json backlog_id must resolve to issue #151 source-backed selector.');
  if (contract.authority_status !== 'ACTIVE_SOURCE_BACKED_SELECTOR_ASSIGNED') failures.push('.foldera-contract.json authority_status must be ACTIVE_SOURCE_BACKED_SELECTOR_ASSIGNED.');
  if (contract.base_commit !== BASE_SHA) failures.push(`.foldera-contract.json base_commit must be ${BASE_SHA}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  if (priority !== 'SOURCE_BACKED_RIGHT_NOW_SELECTOR') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be SOURCE_BACKED_RIGHT_NOW_SELECTOR; found ${priority ?? 'none'}.`);
  if (workType !== 'SOURCE_BACKED_STATE_SELECTOR') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_BACKED_STATE_SELECTOR; found ${workType ?? 'none'}.`);

  if (!handoff.includes('Issue #136 remains open as the standing Codex Run Ledger only.')) failures.push('ACTIVE_HANDOFF.md must preserve #136 as ledger-only.');
  if (!handoff.includes('Issue #140 / PR #142 remains rail-only and parked externally blocked')) failures.push('ACTIVE_HANDOFF.md must park issue #140 / PR #142 as rail-only and externally blocked.');
  if (!handoff.includes('Next seam: issue #151 - source-backed Right Now state selector')) failures.push('ACTIVE_HANDOFF.md must promote issue #151 as the next seam.');
  if (!handoff.includes('do not patch Slack code until logs prove a code-owned failure')) failures.push('ACTIVE_HANDOFF.md must forbid Slack code patches until a code-owned failure is proven.');
  if (!handoff.includes('read `tkg_signals`, `tkg_commitments`, and optionally `tkg_actions.evidence` shaped rows')) failures.push('ACTIVE_HANDOFF.md must name the existing source-shaped rows for issue #151.');
  if (!handoff.includes('state_source: "source_backed"')) failures.push('ACTIVE_HANDOFF.md must require state_source source_backed.');
  if (!handoff.includes('safe `source_trail[]`')) failures.push('ACTIVE_HANDOFF.md must require safe source_trail.');

  if (!buildOrder.includes('issue #136 remains open only as the standing ledger')) failures.push('FOLDERA_BUILD_ORDER.yaml must preserve #136 as ledger-only.');
  if (!buildOrder.includes('PR #142 remains rail-only and parked externally blocked')) failures.push('FOLDERA_BUILD_ORDER.yaml must preserve PR #142 as parked rail-only.');
  if (!buildOrder.includes('Do not widen PR #142 into source-backed selector work')) failures.push('FOLDERA_BUILD_ORDER.yaml must forbid PR #142 widening into selector work.');
  if (!buildOrder.includes('do not patch Slack code until logs prove a code-owned failure')) failures.push('FOLDERA_BUILD_ORDER.yaml must forbid Slack code patches until a code-owned failure is proven.');
  if (!buildOrder.includes('read existing Supabase-shaped rows only from public.tkg_signals, public.tkg_commitments, and optionally public.tkg_actions.evidence')) failures.push('FOLDERA_BUILD_ORDER.yaml must require existing source-shaped table inputs.');
  if (!buildOrder.includes('produce quiet/no safe source-backed move or WorkdayPresenceState with state_source source_backed')) failures.push('FOLDERA_BUILD_ORDER.yaml must require source-backed WorkdayPresenceState or quiet fallback.');
  if (!buildOrder.includes('no mutation of tkg_* tables')) failures.push('FOLDERA_BUILD_ORDER.yaml must forbid tkg_* mutation.');

  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);

  if (!contract.acceptance_condition?.includes('promotes issue #151')) failures.push('.foldera-contract.json acceptance_condition must promote issue #151.');
  if (!contract.next_command?.includes('Run issue #151 source-backed Right Now state selector only.')) failures.push('.foldera-contract.json next_command must command issue #151 source-backed selector only.');
  if (!readRepoFile(root, 'AGENTS.md').includes('## MANDATORY CODEX RUN LEDGER CLOSEOUT')) failures.push('AGENTS.md must contain MANDATORY CODEX RUN LEDGER CLOSEOUT.');

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

  console.log('Source truth check passed. Issue #151 source-backed selector is active and PR #142 remains rail-only parked.');
}
