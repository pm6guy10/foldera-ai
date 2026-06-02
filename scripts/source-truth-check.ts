import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type FolderaContract = {
  active?: boolean;
  active_issue?: number | null;
  backlog_id?: string;
  authority_status?: string;
  money_loop_rung?: string;
  user_system_path?: string;
  allowed_file_patterns?: string[];
  forbidden_file_patterns?: string[];
  required_local_proof?: string[] | string;
};

const COMPLETED_ISSUE = 143;
const COMPLETED_PR = 145;
const COMPLETED_MERGE_SHA = 'e93f8fa5fdcd2a4fb907370a71791484678cbadc';
const COMPLETED_ISSUES = [126, 138, 140, 143];
const ACTIVE_ISSUE = 147;
const ASSIGNMENT_BASE_SHA = '26c19af9070e40a2699a8af7857c3b205d94aee6';
const CLOSED_DO_NOT_REOPEN_PRS = [124, 125];
const REQUIRED_PROOF_COMMANDS = [
  'npm run gate:command',
  'npm run gate:continuity',
];

const REQUIRED_ALLOWED_FILES = [
  '.foldera-contract.json',
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
];

const REQUIRED_FORBIDDEN_MARKERS = [
  'slack',
  'supabase schema',
  'dashboard',
  'auth/backend',
  'stripe',
  'package',
  'vite',
  'react router',
  'shadcn',
  'pr #142',
  'fake',
  'broad cleanup',
];

const REQUIRED_ROUTE_ACCESS_CONTRACT = [
  '/ = public marketing landing shell',
  'access/get started/join pilot CTAs -> /start',
  'login CTAs -> /login',
  '/signup continues redirecting to /start',
  '/try remains redirected to /start',
  '/request-access is absent or redirects to /start',
  '/demo unchanged',
  'no fake signup, waitlist, request-access API, or email/password auth',
];

const REQUIRED_FORBIDDEN_WORK = [
  'Slack files',
  'Supabase schema',
  'dashboard files',
  'auth rewrite',
  'backend changes',
  'Stripe changes',
  'package.json dependency additions',
  'Vite scaffold',
  'React Router',
  'bulk shadcn/Radix import',
  'fake customer logos',
  'fake SOC2/HIPAA/ISO claims',
  '10x/autonomous-agents/coding-agent language',
  'PR #142 mutation',
  'broad cleanup',
  'reopening PR #124 or PR #125',
];

const REQUIRED_ALLOWED_ASSIGNMENT_FILES = [
  '.foldera-contract.json',
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'scripts/source-truth-check.ts',
  'tests/config/__tests__/source-truth-check.test.ts',
  'scripts/continuity-gate.ts',
  'tests/config/__tests__/continuity-gate.test.ts',
];

const FORBIDDEN_ASSIGNMENT_ALLOWED_FILES = [
  'components/foldera/LandingPage.tsx',
  'app/page.tsx',
  'components/nav/NavPublic.tsx',
  'tests/e2e/public-routes.spec.ts',
  'next.config.mjs',
  'package.json',
  'package-lock.json',
  'app/api/slack/**',
  'supabase/**',
  'app/dashboard/**',
  'lib/auth/**',
  'app/api/auth/**',
  'app/api/stripe/**',
];

const REQUIRED_NEXT_PR_PROOF = [
  'npx playwright test tests/e2e/public-routes.spec.ts --reporter=list',
  'updated/run landing visual/access spec as needed',
  'npx vitest run tests/config/__tests__/public-presence.test.ts tests/config/__tests__/active-api-surface.test.ts --reporter=verbose',
  'npm run gate:command',
  'npm run gate:continuity',
  'npm run lint',
  'npm run build',
  'git diff --check',
];

const REQUIRED_ASSIGNMENT_PROOF = [
  'npm run health',
  'npx vitest run tests/config/__tests__/source-truth-check.test.ts tests/config/__tests__/continuity-gate.test.ts --reporter=verbose',
  'npm run gate:command',
  'npm run gate:continuity',
  'npm run lint',
  'npm run build',
  'git diff --check',
];

const REQUIRED_HANDOFF_FORBIDDEN = [
  'No fake signup, waitlist, request-access API, email/password auth, customer logos, certifications, enterprise proof, or unsupported product claims.',
  'Uploaded Figma/Vite export and `foldera (1).html` are visual/content references only; do not import either wholesale.',
  'Do not touch Slack, Supabase schema, dashboard, auth/backend, Stripe, package dependencies, PR #142, or broad cleanup.',
];

const REQUIRED_CONTRACT_FIELDS: Partial<FolderaContract> = {
  authority_status: 'ACTIVE_IMPLEMENTATION_ASSIGNED',
  active: true,
  active_issue: ACTIVE_ISSUE,
  backlog_id: 'ISSUE_147_PUBLIC_LANDING_SHELL_ROUTE_ACCESS_CONTRACT',
  money_loop_rung: 'public_landing_shell_route_access_contract',
  user_system_path: 'public landing shell adaptation from Figma export without changing auth/access/backend behavior',
};

const REQUIRED_CONTRACT_BASE = ASSIGNMENT_BASE_SHA;

const REQUIRED_BUILD_ORDER_SCALARS = {
  active_issue: `${ACTIVE_ISSUE}`,
  priority_class: 'PUBLIC_LANDING_SHELL_ROUTE_ACCESS_CONTRACT',
  work_type: 'IMPLEMENTATION_PROOF',
};

const REQUIRED_HANDED_OFF_TEXT = [
  `Active implementation seam is issue #${ACTIVE_ISSUE}: Public landing shell adaptation from Figma export without changing auth/access/backend behavior.`,
  `Issue #${ACTIVE_ISSUE} is now the single assigned next seam: adapt \`/\` into a code-native public marketing shell while preserving the real route/access/auth contract.`,
  `Next seam: issue #${ACTIVE_ISSUE} - public landing shell adaptation from Figma export without changing auth/access/backend behavior.`,
];

const REQUIRED_CURRENT_TRUTH_TEXT = [
  'Issue #143 is complete: PR #145 landed deterministic Work Packet Brain proof on `main` at merge commit `e93f8fa5fdcd2a4fb907370a71791484678cbadc`.',
  'Issue #140 / PR #142 is accepted as rail-only proof/blocker',
];

const REQUIRED_BUILD_ORDER_CONTRACT_TEXT = [
  '/ is the public marketing landing shell',
  'access/get started/join pilot CTAs point to /start',
  'login CTAs point to /login',
  '/signup continues redirecting to /start',
  '/try remains redirected to /start',
  '/request-access is absent or redirects to /start',
  '/demo remains unchanged',
  'no fake signup, waitlist, request-access API, or email/password auth',
  'no Figma/Vite wholesale import, Vite scaffold, React Router, dependency additions, or bulk shadcn/Radix import',
  'no Slack, Supabase schema, dashboard, auth/backend, Stripe, PR #142, or broad cleanup changes',
];

type ExtendedFolderaContract = FolderaContract & {
  base_commit?: string;
  route_access_contract_for_next_pr?: string[];
  acceptance_condition?: string;
  stop_condition?: string;
  next_command?: string;
};

function requireIncludes(failures: string[], file: string, body: string, needles: string[]): void {
  for (const needle of needles) {
    if (!body.includes(needle)) failures.push(`${file} is missing required text: ${needle}`);
  }
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
    if (values.includes(entry)) failures.push(`${label} must not include implementation path during source-truth assignment: ${entry}`);
  }
}

function checkSourceTruthAssignment(
  root: string,
  handoff: string,
  buildOrder: string,
  contract: ExtendedFolderaContract,
): string[] {
  const failures: string[] = [];
  const handoffIssue = extractActiveHandoffIssue(handoff);
  const buildIssue = extractYamlNumber(buildOrder, 'active_issue');
  const contractIssue = contract.active_issue ?? null;
  const contractIssueFromBacklog = contract.backlog_id?.match(/^ISSUE_(\d+)_/)?.[1]
    ? Number(contract.backlog_id.match(/^ISSUE_(\d+)_/)?.[1])
    : null;

  if (handoffIssue !== ACTIVE_ISSUE) failures.push(`ACTIVE_HANDOFF.md must name active issue #${ACTIVE_ISSUE}; found ${handoffIssue ?? 'none'}.`);
  if (buildIssue !== ACTIVE_ISSUE) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be ${ACTIVE_ISSUE}; found ${buildIssue ?? 'none'}.`);
  if (contractIssue !== ACTIVE_ISSUE) failures.push(`.foldera-contract.json active_issue must be ${ACTIVE_ISSUE}; found ${contractIssue ?? 'none'}.`);
  if (contractIssueFromBacklog !== ACTIVE_ISSUE) failures.push(`.foldera-contract.json backlog_id must resolve to issue #${ACTIVE_ISSUE}; found ${contract.backlog_id ?? 'none'}.`);

  for (const [key, value] of Object.entries(REQUIRED_CONTRACT_FIELDS)) {
    if (contract[key as keyof FolderaContract] !== value) failures.push(`.foldera-contract.json ${key} must be ${String(value)}.`);
  }
  if (contract.base_commit !== REQUIRED_CONTRACT_BASE) failures.push(`.foldera-contract.json base_commit must be ${REQUIRED_CONTRACT_BASE}.`);

  for (const [key, value] of Object.entries(REQUIRED_BUILD_ORDER_SCALARS)) {
    const actual = extractYamlScalar(buildOrder, key);
    if (actual !== value) failures.push(`FOLDERA_BUILD_ORDER.yaml ${key} must be ${value}; found ${actual ?? 'none'}.`);
  }

  requireIncludes(failures, 'ACTIVE_HANDOFF.md', handoff, REQUIRED_HANDED_OFF_TEXT);
  requireIncludes(failures, 'ACTIVE_HANDOFF.md', handoff, REQUIRED_CURRENT_TRUTH_TEXT);
  requireIncludes(failures, 'ACTIVE_HANDOFF.md', handoff, REQUIRED_HANDOFF_FORBIDDEN);
  requireIncludes(failures, 'FOLDERA_BUILD_ORDER.yaml', buildOrder, REQUIRED_BUILD_ORDER_CONTRACT_TEXT);
  requireIncludes(failures, 'FOLDERA_BUILD_ORDER.yaml', buildOrder, REQUIRED_NEXT_PR_PROOF);

  if (!/issue:\s*121[\s\S]*?paused\/superseded by issue #147/i.test(buildOrder)) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must say issue #121 is paused/superseded by issue #147.');
  }
  if (!/Issue #121 landing work is paused\/superseded by issue #147/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must say issue #121 is paused/superseded by issue #147.');
  }
  if (!/issue:\s*146[\s\S]*?merge_sha:\s*26c19af9070e40a2699a8af7857c3b205d94aee6/i.test(buildOrder)) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must record PR #146 source-truth closeout as complete.');
  }

  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_ASSIGNMENT_FILES);
  requireArrayExcludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, FORBIDDEN_ASSIGNMENT_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_ASSIGNMENT_PROOF);
  requireArrayIncludes(failures, '.foldera-contract.json route_access_contract_for_next_pr', contract.route_access_contract_for_next_pr, REQUIRED_ROUTE_ACCESS_CONTRACT);

  const forbiddenText = `${(contract.forbidden_file_patterns ?? []).join('\n')}\n${contract.forbidden_files_raw ?? ''}`.toLowerCase();
  for (const marker of REQUIRED_FORBIDDEN_MARKERS) {
    if (!forbiddenText.includes(marker)) failures.push(`.foldera-contract.json forbidden files must include ${marker}.`);
  }
  for (const marker of REQUIRED_FORBIDDEN_WORK) {
    if (!buildOrder.includes(`  - ${marker}`)) failures.push(`FOLDERA_BUILD_ORDER.yaml forbidden_current_work is missing: ${marker}`);
  }

  if (!contract.acceptance_condition?.includes(`issue #${ACTIVE_ISSUE} public landing shell adaptation`)) {
    failures.push('.foldera-contract.json acceptance_condition must name issue #147 public landing shell adaptation.');
  }
  if (!contract.stop_condition?.includes('Do not implement the landing in this PR.')) {
    failures.push('.foldera-contract.json stop_condition must forbid landing implementation in this PR.');
  }
  if (!contract.next_command?.includes(`Run issue #${ACTIVE_ISSUE} only.`)) {
    failures.push('.foldera-contract.json next_command must command issue #147 only.');
  }

  if (!readRepoFile(root, 'AGENTS.md').includes('## MANDATORY CODEX RUN LEDGER CLOSEOUT')) {
    failures.push('AGENTS.md must contain MANDATORY CODEX RUN LEDGER CLOSEOUT.');
  }

  const packageJson = readJson<{ scripts?: Record<string, string> }>(root, 'package.json');
  if (packageJson.scripts?.['gate:command'] !== 'npx tsx scripts/source-truth-check.ts') failures.push('package.json must define gate:command as npx tsx scripts/source-truth-check.ts.');

  return failures;
}

// Legacy closeout constants retained below this point for fixture mutation tests.
const PAUSED_LANDING_ISSUE = 121;
const LEGACY_REQUIRED_FORBIDDEN_MARKERS = [
  'landing',
  'dashboard',
  'stripe',
  'slack',
  'schema',
  'live slack',
  'teams',
  'email',
  'calendar',
  'outreach',
  'downgrade',
  'broad cleanup',
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
  return match ? match[1].trim().replace(/^['\"]|['\"]$/g, '') : null;
}

function extractActiveHandoffIssue(raw: string): number | null {
  const match = raw.match(/^Active implementation seam is issue #(\d+).*$/m);
  return match ? Number(match[1]) : null;
}

function extractIssueNumbers(raw: string, phrase: RegExp): number[] {
  const numbers: number[] = [];
  for (const match of raw.matchAll(phrase)) numbers.push(Number(match[1]));
  return numbers;
}

function hasPausedIssue(raw: string, issue: number): boolean {
  const issueIndex = raw.search(new RegExp(`issue:\\s*${issue}\\b`, 'i'));
  if (issueIndex === -1) return false;
  const nearby = raw.slice(issueIndex, issueIndex + 500).toLowerCase();
  return nearby.includes('paused');
}

function hasClosedDoNotReopenPr(raw: string, pr: number): boolean {
  const prIndex = raw.search(new RegExp(`pr:\\s*${pr}\\b`, 'i'));
  if (prIndex === -1) return false;
  const nearby = raw.slice(prIndex, prIndex + 300).toLowerCase();
  return nearby.includes('closed_do_not_reopen') && nearby.includes('do not reopen');
}

function activeOrReopenableClosedPr(raw: string, pr: number): boolean {
  const activePattern = new RegExp(`PR #${pr}[^\\n]*(active|reopen|resume|reuse)`, 'i');
  const activeYamlPattern = new RegExp(`active_(pr|pull_request):\\s*${pr}\\b`, 'i');
  const allowedNegativePattern = new RegExp(`PR #${pr}[^\\n]*(closed|superseded|must not be reopened|do not reopen|do not reopenable|closed_do_not_reopen)`, 'i');
  return (activePattern.test(raw) && !allowedNegativePattern.test(raw)) || activeYamlPattern.test(raw);
}

function proofUsesProtectedVercelPreview(raw: string): boolean {
  return raw.split(/\r?\n/).some((line) => {
    const normalized = line.toLowerCase();
    if (!normalized.includes('vercel') || !normalized.includes('proof')) return false;
    if (normalized.includes('not proof') || normalized.includes('not treated as proof') || normalized.includes('do not') || normalized.includes('reject')) return false;
    return /https?:\/\/[^\s)]+vercel\.(app|com)/i.test(line) || /foldera-ai-[^\s)]+\.vercel\.app/i.test(line);
  });
}

function includesAll(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => !haystack.includes(needle));
}

function contractProofCommands(contract: FolderaContract): string[] {
  if (Array.isArray(contract.required_local_proof)) return contract.required_local_proof;
  if (typeof contract.required_local_proof === 'string') return contract.required_local_proof.split(/[;\n]/).map((entry) => entry.trim()).filter(Boolean);
  return [];
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

  return checkSourceTruthAssignment(root, handoff, buildOrder, contract as ExtendedFolderaContract);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runSourceTruthCheck(process.cwd());
  if (failures.length > 0) {
    console.error('Source truth check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Source truth check passed. Issue #147 is the only active implementation seam and this PR remains source-truth assignment only.');
}
