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

const ACTIVE_ISSUE = 140;
const COMPLETED_ISSUE = 147;
const COMPLETED_PR = 149;
const COMPLETED_MERGE_SHA = 'd9ede1dd39c3de3b3fe5bd5e3592b0ced001fdf3';

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

function requireBuildOrderCompletedIssue(failures: string[], buildOrder: string): void {
  const pattern = new RegExp(
    `issue:\\s*${COMPLETED_ISSUE}[\\s\\S]*?pr:\\s*${COMPLETED_PR}[\\s\\S]*?merge_sha:\\s*${COMPLETED_MERGE_SHA}`,
    'i',
  );
  if (!pattern.test(buildOrder)) {
    failures.push(`FOLDERA_BUILD_ORDER.yaml must record issue #${COMPLETED_ISSUE} / PR #${COMPLETED_PR} as complete with merge ${COMPLETED_MERGE_SHA}.`);
  }
}

function requireClosedIssueDoNotReopen(failures: string[], handoff: string, buildOrder: string): void {
  for (const issue of REQUIRED_CLOSED_ISSUES) {
    if (!new RegExp(`issue:\\s*${issue}[\\s\\S]*?(closed|completed|superseded)`, 'i').test(buildOrder)) {
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
  if (contract.backlog_id !== 'ISSUE_140_REAL_SLACK_SELF_LOOP_LIVE_RAIL_PROOF') failures.push('.foldera-contract.json backlog_id must resolve to issue #140 live rail proof.');
  if (contract.authority_status !== 'ACTIVE_LIVE_RAIL_PROOF_ASSIGNED') failures.push('.foldera-contract.json authority_status must be ACTIVE_LIVE_RAIL_PROOF_ASSIGNED.');
  if (contract.base_commit !== COMPLETED_MERGE_SHA) failures.push(`.foldera-contract.json base_commit must be ${COMPLETED_MERGE_SHA}.`);

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  if (priority !== 'SLACK_LIVE_RAIL_PROOF_BLOCKER_CLASSIFICATION') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be SLACK_LIVE_RAIL_PROOF_BLOCKER_CLASSIFICATION; found ${priority ?? 'none'}.`);
  if (workType !== 'LIVE_RAIL_PROOF_BLOCKER_CLASSIFICATION') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be LIVE_RAIL_PROOF_BLOCKER_CLASSIFICATION; found ${workType ?? 'none'}.`);

  if (!handoff.includes(`Issue #147 is complete: PR #149 landed the public landing shell adaptation on \`main\` at merge commit \`${COMPLETED_MERGE_SHA}\``)) {
    failures.push('ACTIVE_HANDOFF.md must mark issue #147 / PR #149 complete.');
  }
  if (!handoff.includes('Issue #136 remains open as the standing Codex Run Ledger only.')) failures.push('ACTIVE_HANDOFF.md must preserve #136 as ledger-only.');
  if (!handoff.includes('Next seam: issue #140 / PR #142 - real Slack self-loop live callback proof or blocker classification.')) failures.push('ACTIVE_HANDOFF.md must promote #140 / PR #142 as the next seam.');
  if (!handoff.includes('do not patch Slack code until logs prove a code-owned failure')) failures.push('ACTIVE_HANDOFF.md must forbid Slack code patches until a code-owned failure is proven.');

  if (!buildOrder.includes('issue #136 remains open only as the standing ledger')) failures.push('FOLDERA_BUILD_ORDER.yaml must preserve #136 as ledger-only.');
  if (!buildOrder.includes('PR #142 remains the rail PR and blocker evidence surface')) failures.push('FOLDERA_BUILD_ORDER.yaml must preserve PR #142 as the rail surface.');
  if (!buildOrder.includes('do not patch Slack code until logs prove a code-owned failure')) failures.push('FOLDERA_BUILD_ORDER.yaml must forbid Slack code patches until a code-owned failure is proven.');

  requireBuildOrderCompletedIssue(failures, buildOrder);
  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);

  if (!contract.acceptance_condition?.includes('marks issue #147 / PR #149 complete')) failures.push('.foldera-contract.json acceptance_condition must mark issue #147 / PR #149 complete.');
  if (!contract.next_command?.includes('Run issue #140 / PR #142 live rail proof only.')) failures.push('.foldera-contract.json next_command must command issue #140 / PR #142 live rail proof only.');
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

  console.log('Source truth check passed. Issue #147 is complete and issue #140 live rail proof is active.');
}
