import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type FolderaContract = {
  active?: boolean;
  active_issue?: number;
  backlog_id?: string;
  authority_status?: string;
  money_loop_rung?: string;
  user_system_path?: string;
  allowed_file_patterns?: string[];
  forbidden_file_patterns?: string[];
  required_local_proof?: string[] | string;
};

const ACTIVE_ISSUE = 140;
const COMPLETED_ISSUES = [126, 138];
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

  if (handoffIssue !== ACTIVE_ISSUE) failures.push(`ACTIVE_HANDOFF.md must name issue #${ACTIVE_ISSUE} as active; found ${handoffIssue ?? 'none'}.`);
  if (buildIssue !== ACTIVE_ISSUE) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be ${ACTIVE_ISSUE}; found ${buildIssue ?? 'none'}.`);
  if (contract?.authority_status !== 'CURRENT_CONTROL') failures.push('.foldera-contract.json authority_status must be CURRENT_CONTROL.');
  if (contract?.active !== true) failures.push('.foldera-contract.json active must be true.');
  if (contractIssue !== ACTIVE_ISSUE) failures.push(`.foldera-contract.json active_issue must be ${ACTIVE_ISSUE}; found ${contractIssue ?? 'none'}.`);
  if (contractIssueFromBacklog !== ACTIVE_ISSUE) failures.push(`.foldera-contract.json backlog_id must resolve to issue #${ACTIVE_ISSUE}; found ${contract?.backlog_id ?? 'none'}.`);
  if (contract?.money_loop_rung !== 'real_slack_self_loop_implementation') failures.push('.foldera-contract.json money_loop_rung must be real_slack_self_loop_implementation.');
  if (contract?.user_system_path !== 'implement one bounded Real Slack Self-Loop after issue #138 source-truth promotion') failures.push('.foldera-contract.json user_system_path must be implement one bounded Real Slack Self-Loop after issue #138 source-truth promotion.');

  if (handoffIssue !== null && buildIssue !== null && handoffIssue !== buildIssue) failures.push(`ACTIVE_HANDOFF.md and FOLDERA_BUILD_ORDER.yaml disagree: #${handoffIssue} vs #${buildIssue}.`);
  if (handoffIssue !== null && contractIssue !== null && handoffIssue !== contractIssue) failures.push(`ACTIVE_HANDOFF.md and .foldera-contract.json disagree: #${handoffIssue} vs #${contractIssue}.`);
  if (buildIssue !== null && contractIssue !== null && buildIssue !== contractIssue) failures.push(`FOLDERA_BUILD_ORDER.yaml and .foldera-contract.json disagree: #${buildIssue} vs #${contractIssue}.`);
  if (contractIssue !== null && contractIssueFromBacklog !== null && contractIssue !== contractIssueFromBacklog) failures.push(`.foldera-contract.json active_issue and backlog_id disagree: #${contractIssue} vs #${contractIssueFromBacklog}.`);

  const handoffActiveIssueMentions = extractIssueNumbers(handoff, /^Active implementation seam is issue #(\d+).*$/gm);
  if (handoffActiveIssueMentions.length !== 1) failures.push(`ACTIVE_HANDOFF.md must name exactly one active seam; found ${handoffActiveIssueMentions.length}.`);
  if (handoffActiveIssueMentions.some((issue) => issue !== ACTIVE_ISSUE)) failures.push(`ACTIVE_HANDOFF.md has an active seam other than issue #${ACTIVE_ISSUE}.`);

  if (buildPriorityClass !== 'REAL_SLACK_SELF_LOOP_IMPLEMENTATION') failures.push('FOLDERA_BUILD_ORDER.yaml priority_class must be REAL_SLACK_SELF_LOOP_IMPLEMENTATION.');
  if (buildWorkType !== 'IMPLEMENTATION') failures.push('FOLDERA_BUILD_ORDER.yaml work_type must be IMPLEMENTATION.');
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
  if (!/Issue #126[\s\S]*?complete[\s\S]*?blocker is resolved/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must say issue #126 is complete and the Supabase measurement/downgrade blocker is resolved.');
  }
  if (!/Issue #138[\s\S]*?complete[\s\S]*?PR #139[\s\S]*?without Slack implementation code/i.test(handoff)) {
    failures.push('ACTIVE_HANDOFF.md must say issue #138 is complete after PR #139 without Slack implementation code.');
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
    'live Slack install beyond the one self-loop boundary',
    'Slack OAuth beyond the one self-loop boundary',
    'live Slack send beyond the one self-loop boundary',
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

  console.log('Source truth check passed. Active issue #140 is the bounded Real Slack Self-Loop implementation seam.');
}
