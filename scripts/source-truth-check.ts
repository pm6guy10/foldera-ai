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
const PAUSED_LANDING_ISSUE = 121;
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

  const handoffIssue = extractActiveHandoffIssue(handoff);
  const buildIssue = extractYamlNumber(buildOrder, 'active_issue');
  const buildPriorityClass = extractYamlScalar(buildOrder, 'priority_class');
  const buildWorkType = extractYamlScalar(buildOrder, 'work_type');
  const contractIssue = contract?.active_issue ?? null;
  const contractIssueFromBacklog = contract?.backlog_id?.match(/^ISSUE_(\d+)_/)?.[1]
    ? Number(contract.backlog_id.match(/^ISSUE_(\d+)_/)?.[1])
    : null;

  if (handoffIssue !== null) failures.push(`ACTIVE_HANDOFF.md must not name an active implementation seam after PR #${COMPLETED_PR}; found #${handoffIssue}.`);
  if (buildIssue !== null) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be null after PR #${COMPLETED_PR}; found ${buildIssue}.`);
  if (contract?.authority_status !== 'CLOSEOUT_CONTROL') failures.push('.foldera-contract.json authority_status must be CLOSEOUT_CONTROL.');
  if (contract?.active !== true) failures.push('.foldera-contract.json active must be true.');
  if (contractIssue !== null) failures.push(`.foldera-contract.json active_issue must be null after PR #${COMPLETED_PR}; found ${contractIssue}.`);
  if (contractIssueFromBacklog !== null) failures.push(`.foldera-contract.json backlog_id must not resolve to an active issue after PR #${COMPLETED_PR}; found ${contract?.backlog_id ?? 'none'}.`);
  if (contract?.backlog_id !== 'NO_NEXT_SEAM_ASSIGNED_AFTER_PR_145') failures.push('.foldera-contract.json backlog_id must be NO_NEXT_SEAM_ASSIGNED_AFTER_PR_145.');
  if (contract?.money_loop_rung !== 'blocked_no_next_seam_assigned') failures.push('.foldera-contract.json money_loop_rung must be blocked_no_next_seam_assigned.');
  if (contract?.user_system_path !== 'close out issue #143 after PR #145 merge without starting a new implementation seam') failures.push('.foldera-contract.json user_system_path must be close out issue #143 after PR #145 merge without starting a new implementation seam.');

  if (handoffIssue !== null && buildIssue !== null && handoffIssue !== buildIssue) failures.push(`ACTIVE_HANDOFF.md and FOLDERA_BUILD_ORDER.yaml disagree: #${handoffIssue} vs #${buildIssue}.`);
  if (handoffIssue !== null && contractIssue !== null && handoffIssue !== contractIssue) failures.push(`ACTIVE_HANDOFF.md and .foldera-contract.json disagree: #${handoffIssue} vs #${contractIssue}.`);
  if (buildIssue !== null && contractIssue !== null && buildIssue !== contractIssue) failures.push(`FOLDERA_BUILD_ORDER.yaml and .foldera-contract.json disagree: #${buildIssue} vs #${contractIssue}.`);
  if (contractIssue !== null && contractIssueFromBacklog !== null && contractIssue !== contractIssueFromBacklog) failures.push(`.foldera-contract.json active_issue and backlog_id disagree: #${contractIssue} vs #${contractIssueFromBacklog}.`);

  const handoffActiveIssueMentions = extractIssueNumbers(handoff, /^Active implementation seam is issue #(\d+).*$/gm);
  if (handoffActiveIssueMentions.length !== 0) failures.push(`ACTIVE_HANDOFF.md must name zero active seams after PR #${COMPLETED_PR}; found ${handoffActiveIssueMentions.length}.`);

  if (buildPriorityClass !== 'BLOCKED_NO_NEXT_SEAM_ASSIGNED') failures.push('FOLDERA_BUILD_ORDER.yaml priority_class must be BLOCKED_NO_NEXT_SEAM_ASSIGNED.');
  if (buildWorkType !== 'SOURCE_TRUTH_CLOSEOUT') failures.push('FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_TRUTH_CLOSEOUT.');
  if (!buildOrder.includes('required_gate_command: npm run gate:command')) failures.push('FOLDERA_BUILD_ORDER.yaml must name required_gate_command: npm run gate:command.');
  for (const completedIssue of COMPLETED_ISSUES) {
    if (!buildOrder.includes(`issue: ${completedIssue}`)) failures.push(`FOLDERA_BUILD_ORDER.yaml must list issue #${completedIssue} as completed.`);
  }
  if (!/issue:\s*126[\s\S]*?downgrade blocker is resolved/i.test(buildOrder)) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must list issue #126 as completed with the downgrade blocker resolved.');
  }
  if (!/issue:\s*138[\s\S]*?PR #139[\s\S]*?without Slack implementation code/i.test(buildOrder)) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must list issue #138 / PR #139 as completed without Slack implementation code.');
  }
  if (!/issue:\s*140[\s\S]*?PR #142[\s\S]*?rail-only[\s\S]*?externally blocked/i.test(buildOrder)) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must preserve issue #140 / PR #142 as rail-only and externally blocked.');
  }
  if (!new RegExp(`issue:\\s*${COMPLETED_ISSUE}[\\s\\S]*?pr:\\s*${COMPLETED_PR}[\\s\\S]*?merge_sha:\\s*${COMPLETED_MERGE_SHA}[\\s\\S]*?Deterministic Work Packet Brain proof landed on main`, 'i').test(buildOrder)) {
    failures.push(`FOLDERA_BUILD_ORDER.yaml must list issue #${COMPLETED_ISSUE} / PR #${COMPLETED_PR} complete at merge SHA ${COMPLETED_MERGE_SHA}.`);
  }
  if (!/Issue #126[\s\S]*?complete[\s\S]*?blocker is resolved/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must say issue #126 is complete and the Supabase measurement/downgrade blocker is resolved.');
  }
  if (!/Issue #138[\s\S]*?complete[\s\S]*?PR #139[\s\S]*?without Slack implementation code/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must say issue #138 is complete after PR #139 without Slack implementation code.');
  }
  if (!/Issue #140[\s\S]*?PR #142[\s\S]*?rail-only[\s\S]*?externally blocked/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must preserve issue #140 / PR #142 as rail-only and externally blocked.');
  }
  if (!new RegExp(`Issue #${COMPLETED_ISSUE}[\\s\\S]*?complete[\\s\\S]*?PR #${COMPLETED_PR}[\\s\\S]*?${COMPLETED_MERGE_SHA}`, 'i').test(handoff)) {
    failures.push(`ACTIVE_HANDOFF.md must mark issue #${COMPLETED_ISSUE} / PR #${COMPLETED_PR} complete at merge SHA ${COMPLETED_MERGE_SHA}.`);
  }
  if (!/Next seam:\s*blocked - reason:\s*no next seam assigned after PR #145 merge/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must block the next seam because no next seam is assigned after PR #145 merge.');
  }
  if (!/next_seam:\s*blocked - reason no next seam assigned after PR #145 merge/i.test(buildOrder)) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must block the next seam because no next seam is assigned after PR #145 merge.');
  }

  if (!/issue #121[^\n]*(landing|landing-page)[^\n]*(paused|pause)/i.test(handoff)) failures.push('ACTIVE_HANDOFF.md must say issue #121 landing work is paused.');
  if (!hasPausedIssue(buildOrder, PAUSED_LANDING_ISSUE)) failures.push('FOLDERA_BUILD_ORDER.yaml must say issue #121 is paused.');

  for (const pr of CLOSED_DO_NOT_REOPEN_PRS) {
    if (!handoff.match(new RegExp(`PR #${pr}[^\\n]*(closed|superseded|must not be reopened|do not reopen)`, 'i'))) {
      failures.push(`ACTIVE_HANDOFF.md must say PR #${pr} is closed/superseded and must not be reopened.`);
    }
    if (!hasClosedDoNotReopenPr(buildOrder, pr)) failures.push(`FOLDERA_BUILD_ORDER.yaml must list PR #${pr} as closed_do_not_reopen.`);
    if (activeOrReopenableClosedPr(handoff, pr)) failures.push(`ACTIVE_HANDOFF.md names PR #${pr} as active/reopenable.`);
    if (activeOrReopenableClosedPr(buildOrder, pr)) failures.push(`FOLDERA_BUILD_ORDER.yaml names PR #${pr} as active/reopenable.`);
  }

  const allowedFiles = contract?.allowed_file_patterns ?? [];
  for (const requiredFile of REQUIRED_ALLOWED_FILES) {
    if (!allowedFiles.includes(requiredFile)) failures.push(`.foldera-contract.json allowed_file_patterns must include ${requiredFile}.`);
  }
  for (const forbiddenCloseoutPattern of ['lib/work-packets/**', 'tests/fixtures/work-packets/**']) {
    if (allowedFiles.includes(forbiddenCloseoutPattern)) failures.push(`.foldera-contract.json allowed_file_patterns must not include implementation path ${forbiddenCloseoutPattern} during no-code closeout.`);
  }

  const forbiddenFilesRaw = `${(contract?.forbidden_file_patterns ?? []).join('\n')}\n${readRepoFile(root, '.foldera-contract.json')}`.toLowerCase();
  for (const marker of REQUIRED_FORBIDDEN_MARKERS) {
    if (!forbiddenFilesRaw.includes(marker)) failures.push(`.foldera-contract.json forbidden files must include ${marker}.`);
  }

  const proofCommands = contractProofCommands(contract ?? {});
  for (const command of REQUIRED_PROOF_COMMANDS) {
    if (!proofCommands.includes(command)) failures.push(`.foldera-contract.json required_local_proof must include: ${command}`);
  }

  const controllingText = [handoff, buildOrder, readRepoFile(root, '.foldera-contract.json')].join('\n---\n');
  if (proofUsesProtectedVercelPreview(controllingText)) failures.push('Protected Vercel preview links must not be treated as proof text in controlling files.');

  const packageJson = readJson<{ scripts?: Record<string, string> }>(root, 'package.json');
  if (packageJson.scripts?.['gate:command'] !== 'npx tsx scripts/source-truth-check.ts') failures.push('package.json must define gate:command as npx tsx scripts/source-truth-check.ts.');

  const missingForbiddenWork = includesAll(buildOrder, [
    'landing work',
    'Stripe',
    'dashboard redesign',
    'Supabase schema',
    'connector platform expansion',
    'Slack OAuth expansion',
    'live Slack send expansion beyond packet review card proof',
    'Teams expansion',
    'email expansion',
    'calendar expansion',
    'outreach',
    'billing or downgrade work',
    'broad cleanup',
    'reopening PR #124 or PR #125',
  ]);
  for (const missing of missingForbiddenWork) failures.push(`FOLDERA_BUILD_ORDER.yaml forbidden_current_work is missing: ${missing}`);

  if (!readRepoFile(root, 'AGENTS.md').includes('## MANDATORY CODEX RUN LEDGER CLOSEOUT')) {
    failures.push('AGENTS.md must contain MANDATORY CODEX RUN LEDGER CLOSEOUT.');
  }

  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runSourceTruthCheck(process.cwd());
  if (failures.length > 0) {
    console.error('Source truth check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Source truth check passed. Issue #143 / PR #145 are closed out and no next implementation seam is assigned.');
}
