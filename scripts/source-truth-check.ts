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

const REQUIRED_PROOF_COMMANDS = ['npm run gate:command', 'npm run gate:continuity', 'npm run lint', 'git diff --check'];
const REQUIRED_ALLOWED_FILES = [
  '.foldera-contract.json',
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
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
const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 159];

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

function extractYamlNull(raw: string, key: string): boolean {
  return new RegExp(`^${key}:\\s*null\\s*$`, 'm').test(raw);
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
  const buildIssueIsNull = extractYamlNull(buildOrder, 'active_issue');
  const contractIssue = contract.active_issue ?? null;

  if (handoffIssue !== null) failures.push(`ACTIVE_HANDOFF.md must assign no active issue after issue #159 completion; found ${handoffIssue}.`);
  if (!buildIssueIsNull) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be null after issue #159 completion; found ${buildIssue ?? 'none'}.`);
  if (contractIssue !== null) failures.push(`.foldera-contract.json active_issue must be null after issue #159 completion; found ${contractIssue}.`);
  if (contract.active !== false) failures.push('.foldera-contract.json active must be false while next seam is blocked.');
  if (contract.backlog_id !== 'POST_159_BLOCKED_UNTIL_FIRST_10_ICP_EVIDENCE') failures.push('.foldera-contract.json backlog_id must resolve to the post-#159 blocked-until-evidence state.');
  if (contract.authority_status !== 'BLOCKED_NO_ACTION_SAFE_FIRST_10_EVIDENCE') failures.push('.foldera-contract.json authority_status must be BLOCKED_NO_ACTION_SAFE_FIRST_10_EVIDENCE.');
  if (contract.base_commit !== '84c476316a31901378d9627462d4fab155e40105') failures.push('.foldera-contract.json base_commit must be PR #161 merge SHA 84c476316a31901378d9627462d4fab155e40105.');

  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  if (priority !== 'BLOCKED_NO_ACTION_SAFE') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be BLOCKED_NO_ACTION_SAFE; found ${priority ?? 'none'}.`);
  if (workType !== 'SOURCE_TRUTH_CLOSEOUT_POST_159') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_TRUTH_CLOSEOUT_POST_159; found ${workType ?? 'none'}.`);

  if (!handoff.includes('Issue #136 remains open as the standing Codex Run Ledger only.')) failures.push('ACTIVE_HANDOFF.md must preserve #136 as ledger-only.');
  if (!handoff.includes('Issue #140 / PR #142 remains rail-only and parked externally blocked')) failures.push('ACTIVE_HANDOFF.md must park issue #140 / PR #142 as rail-only and externally blocked.');
  if (!handoff.includes('Issue #159 is complete: PR #161 created `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`')) failures.push('ACTIVE_HANDOFF.md must record issue #159 complete via PR #161.');
  if (!handoff.includes('No active implementation seam is assigned.')) failures.push('ACTIVE_HANDOFF.md must explicitly assign no active implementation seam.');
  if (!handoff.includes('Next seam: blocked - reason: no next growth/product seam is authorized until real first-10 ICP evidence exists in `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`.')) failures.push('ACTIVE_HANDOFF.md must block the next seam until real first-10 ICP evidence exists.');
  if (!handoff.includes('Foldera North Star Lock')) failures.push('ACTIVE_HANDOFF.md must name Foldera North Star Lock.');
  if (!handoff.includes('Forbidden until a future GitHub issue is justified by real tracker evidence: product implementation, scraping, auto-DM, outreach automation, paid ads, public claim expansion, connector expansion, Slack / PR #142 work, landing/frontend/dashboard work, Supabase, Stripe, Teams/email/calendar, package files, customer data mutation, and broad cleanup.')) failures.push('ACTIVE_HANDOFF.md must preserve the post-#159 forbidden-work boundary.');

  if (!buildOrder.includes('issue #136 remains open only as the standing ledger')) failures.push('FOLDERA_BUILD_ORDER.yaml must preserve #136 as ledger-only.');
  if (!buildOrder.includes('PR #142 remains rail-only and parked externally blocked')) failures.push('FOLDERA_BUILD_ORDER.yaml must preserve PR #142 as parked rail-only.');
  if (!buildOrder.includes('Do not widen PR #142 into source-truth selection, growth work, or product work')) failures.push('FOLDERA_BUILD_ORDER.yaml must forbid PR #142 widening into source-truth selection, growth, or product work.');
  if (!buildOrder.includes('issue: 151') || !buildOrder.includes('merge_sha: be5d596c8033f9b273ceb025aa3c2c18333520f4')) failures.push('FOLDERA_BUILD_ORDER.yaml must record issue #151 / PR #153 completed with merge SHA.');
  if (!buildOrder.includes('issue: 154') || !buildOrder.includes('stopped BLOCKED because no controlling issue existed')) failures.push('FOLDERA_BUILD_ORDER.yaml must record issue #154 as completed/blocked selector.');
  if (!buildOrder.includes('issue: 156') || !buildOrder.includes('merge_sha: daf86948646dc26e1ef700d5370ac4916f52a1e3')) failures.push('FOLDERA_BUILD_ORDER.yaml must record issue #156 / PR #158 completed with merge SHA.');
  if (!buildOrder.includes('issue: 159') || !buildOrder.includes('merge_sha: 84c476316a31901378d9627462d4fab155e40105')) failures.push('FOLDERA_BUILD_ORDER.yaml must record issue #159 / PR #161 completed with merge SHA.');
  if (!buildOrder.includes('next_seam: blocked - reason no next growth/product seam is authorized until real first-10 ICP evidence exists in docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md')) failures.push('FOLDERA_BUILD_ORDER.yaml must block the next seam until real first-10 ICP evidence exists.');
  if (!buildOrder.includes('post_159_blocked_until_evidence')) failures.push('FOLDERA_BUILD_ORDER.yaml must define the post-#159 blocked-until-evidence contract.');
  if (!buildOrder.includes('required_issue_156_north_star_lock')) failures.push('FOLDERA_BUILD_ORDER.yaml must retain the issue #156 North Star Lock contract.');
  if (!buildOrder.includes('required_issue_159_growth_scout')) failures.push('FOLDERA_BUILD_ORDER.yaml must define the issue #159 Growth Scout contract.');
  if (!buildOrder.includes('forbid paid ads, broad launch, automated outreach, scraping, auto-DM, marketing automation')) failures.push('FOLDERA_BUILD_ORDER.yaml must lock the issue #159 no-growth boundary.');

  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  requireArrayIncludes(failures, '.foldera-contract.json allowed_file_patterns', contract.allowed_file_patterns, REQUIRED_ALLOWED_FILES);
  requireArrayIncludes(failures, '.foldera-contract.json forbidden_file_patterns', contract.forbidden_file_patterns, FORBIDDEN_PRODUCT_PATHS);
  requireArrayIncludes(failures, '.foldera-contract.json required_local_proof', contractProofCommands(contract), REQUIRED_PROOF_COMMANDS);

  if (!contract.acceptance_condition?.includes('issue #159 complete via PR #161')) failures.push('.foldera-contract.json acceptance_condition must record issue #159 complete via PR #161.');
  if (!contract.next_command?.includes('Collect/manual-record real first-10 ICP evidence only')) failures.push('.foldera-contract.json next_command must command manual evidence collection only.');
  if (!readRepoFile(root, 'AGENTS.md').includes('## MANDATORY CODEX RUN LEDGER CLOSEOUT')) failures.push('AGENTS.md must contain MANDATORY CODEX RUN LEDGER CLOSEOUT.');

  let northStar = '';
  try {
    northStar = readRepoFile(root, 'FOLDERA_NORTH_STAR_LOCK.md');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  for (const section of [
    '## Authority status',
    '## Executive verdict',
    '## Product identity',
    '## Explicit rejections',
    '## First buyer/user',
    '## Revenue/pricing lock',
    '## Public-site lock',
    '## Day-one app experience lock',
    '## Holy-crap moment',
    '## Runtime brain path',
    '## Source-backed Right Now path',
    '## Slack/live rail boundary',
    '## Intake / command rail',
    '## Source-truth authority order',
    '## Stale-doc containment',
    '## Issue order after this lock',
    '## Required gates',
    '## PR traceability requirement',
    '## Pilot-ready definition',
    '## Brandon cognitive-load / household-peace constraint',
    '## Stop condition',
  ]) {
    if (!northStar.includes(section)) failures.push(`FOLDERA_NORTH_STAR_LOCK.md is missing required section: ${section}`);
  }
  for (const marker of [
    '`CURRENT_CONTROL`',
    'Issue #140 / PR #142 remains parked rail-only and externally blocked.',
    'After issue #156, the next issue order is blocked until GitHub source truth names exactly one next seam.',
    'Brandon must not be the router',
    'Every future PR that changes or claims product, business, UX, public-site, runtime brain, Right Now, Slack/live rail, intake/command rail, source-truth authority, issue order, pricing, or pilot-readiness direction must cite `FOLDERA_NORTH_STAR_LOCK.md`.',
  ]) {
    if (!northStar.includes(marker)) failures.push(`FOLDERA_NORTH_STAR_LOCK.md is missing required marker: ${marker}`);
  }

  let sourceMap = '';
  try {
    sourceMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (!sourceMap.includes('| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` |')) failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_NORTH_STAR_LOCK.md as CURRENT_CONTROL.');

  let tracker = '';
  try {
    tracker = readRepoFile(root, 'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (!tracker.includes('# First 10 ICP Evidence Tracker')) failures.push('docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md must exist as the completed issue #159 tracker.');
  if (!tracker.includes('This tracker cites and obeys `FOLDERA_NORTH_STAR_LOCK.md`.')) failures.push('docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md must cite the North Star Lock.');

  let prTemplate = '';
  try {
    prTemplate = readRepoFile(root, '.github/pull_request_template.md');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  if (!prTemplate.includes('North Star traceability for product/business/UX/runtime direction')) failures.push('.github/pull_request_template.md must require North Star traceability for direction changes.');
  if (!prTemplate.includes('- `FOLDERA_NORTH_STAR_LOCK.md`: cited / updated / unchanged - reason / not applicable - reason')) failures.push('.github/pull_request_template.md must include the North Star traceability row.');

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

  console.log('Source truth check passed. Issue #159 is complete via PR #161, no active seam is assigned, next seam is blocked until real first-10 ICP evidence exists, the North Star artifact remains enforced, and PR #142 remains rail-only parked.');
}
