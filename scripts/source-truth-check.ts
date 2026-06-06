import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type QueueItem = {
  id: string;
  status: string;
};

const CONTROLLING_PR = 194;
const COMPLETED_RUNG_2_ISSUE = 175;
const COMPLETED_RUNG_3_ISSUE = 179;
const MASTER_BIBLE_ISSUE = 181;
const SOURCE_TRUTH_CLOSEOUT_ISSUE = 194;
const COMPLETED_COMMAND_OS_ISSUE = 166;
const COMPLETED_MASTER_SYNTHESIS_ISSUE = 170;
const COMPLETED_FIRST_RUNG_ISSUE = 173;
const NEXT_TASK_ID = '006';
const COMPLETED_TASK_IDS = ['001', '002', '003', '004', '005'];

const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 147, 151, 154, 159, 163, COMPLETED_COMMAND_OS_ISSUE, COMPLETED_MASTER_SYNTHESIS_ISSUE, COMPLETED_FIRST_RUNG_ISSUE, COMPLETED_RUNG_2_ISSUE, MASTER_BIBLE_ISSUE, 183];

function readRepoFile(root: string, file: string): string {
  const path = join(root, file);
  if (!existsSync(path)) throw new Error(`Missing required file: ${file}`);
  return readFileSync(path, 'utf8');
}

function extractYamlNumber(raw: string, key: string): number | null {
  const match = raw.match(new RegExp(`^${key}:\\s*(\\d+)\\s*$`, 'm'));
  return match ? Number(match[1]) : null;
}

function extractYamlScalar(raw: string, key: string): string | null {
  const match = raw.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function parseQueueItems(raw: string): QueueItem[] {
  const sections = raw.split(/\n  - id: "/).slice(1);
  return sections.map((section) => {
    const [idLine, ...rest] = section.split(/\r?\n/);
    const id = idLine.replace(/".*$/, '').trim();
    const body = rest.join('\n');
    const statusMatch = body.match(/^\s{4}status:\s*([A-Z_]+)\s*$/m);
    return {
      id,
      status: statusMatch ? statusMatch[1] : 'MISSING',
    };
  });
}

function checkQueueState(failures: string[], queueRaw: string): void {
  const items = parseQueueItems(queueRaw);
  const byId = new Map(items.map((item) => [item.id, item.status]));
  const activeCount = items.filter((item) => item.status === 'ACTIVE').length;

  for (const id of COMPLETED_TASK_IDS) {
    if (byId.get(id) !== 'COMPLETED') failures.push(`FOLDERA_EXECUTION_QUEUE.yaml task ${id} must be COMPLETED.`);
  }
  if (byId.get(NEXT_TASK_ID) !== 'QUEUED') failures.push(`FOLDERA_EXECUTION_QUEUE.yaml task ${NEXT_TASK_ID} must remain QUEUED.`);
  if (activeCount !== 0) failures.push(`FOLDERA_EXECUTION_QUEUE.yaml must have zero ACTIVE tasks in PR #${CONTROLLING_PR}; found ${activeCount}.`);
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
  if (!handoff.includes('Issues #48, #121, #99, #131, #147, #151, #154, #159, #163, #166, #170, #173, #175, #179, #181, #183, #192, and #196 are closed/completed/superseded. Do not reopen them here.')) {
    failures.push('ACTIVE_HANDOFF.md must keep closed/completed/superseded issues, including #181, #183, #192, and #196, out of scope.');
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
  ]) {
    if (!draft.includes(marker)) failures.push(`FOLDERA_MASTER_SYNTHESIS_DRAFT.md is missing required marker: ${marker}`);
  }
  return failures;
}

function checkMasterBible(root: string): string[] {
  const bible = readRepoFile(root, 'FOLDERA_MASTER_BIBLE.md');
  const failures: string[] = [];
  for (const marker of [
    'Authority status: `REFERENCE_AUTHORITY_AFTER_MERGE`',
    'Historical promotion issue: #181 / PR #191',
    'This bible is reference authority, not live execution authority.',
    'It does not activate queue tasks.',
    'It does not mutate `FOLDERA_EXECUTION_QUEUE.yaml`.',
    'When Brandon says "run until you get stuck", Codex should:',
  ]) {
    if (!bible.includes(marker)) failures.push(`FOLDERA_MASTER_BIBLE.md is missing required marker: ${marker}`);
  }
  return failures;
}

function checkSourceTruth(root: string, handoff: string, buildOrder: string, queueRaw: string): string[] {
  const failures: string[] = [];
  const buildIssue = extractYamlNumber(buildOrder, 'active_issue');

  if (buildIssue !== SOURCE_TRUTH_CLOSEOUT_ISSUE) failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be ${SOURCE_TRUTH_CLOSEOUT_ISSUE}; found ${buildIssue ?? 'none'}.`);
  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'MASTER_BIBLE_CLOSEOUT') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be MASTER_BIBLE_CLOSEOUT; found ${priority ?? 'none'}.`);
  if (workType !== 'SOURCE_TRUTH_CLOSEOUT') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be SOURCE_TRUTH_CLOSEOUT; found ${workType ?? 'none'}.`);
  if (nextSeam !== 'first money-loop issue - reason Master Bible closeout is complete and issue #194 is now the active execution issue') {
    failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must preserve the first money-loop activation boundary; found ${nextSeam ?? 'none'}.`);
  }

  for (const marker of [
    'Issue #181 is completed by merged PR #191.',
    'Issue #192 is completed by merged PR #193.',
    'Issue #196 is completed by merged PR #197.',
    'Active implementation seam is issue #194.',
    'The active seam is the first money-loop issue: `Prove sources become signals, signals become context, and context becomes one next move`.',
    '`FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.',
    '`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.',
    'PR #189 remains `UNMERGED_DRAFT_CONTEXT_ONLY`.',
    'Issue #140 / PR #142 remains rail-only and parked outside this sweep.',
    'GitHub writeback is mandatory.',
    'One active seam only.',
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }
  for (const staleMarker of [
    'Active implementation seam is `EXECUTION_QUEUE`.',
    'The active seam is now controlled entirely by `FOLDERA_EXECUTION_QUEUE.yaml`.',
    'Task `006` remains queued.',
    'No Task `006` work has started in this PR.',
    'PR #183 is a source-truth and gate-alignment seam only.',
    'Issue #196 is the active source-truth cleanup seam.',
    'The active seam is the root source-truth archive/delete sweep: `Root source-truth archive/delete sweep`.',
    'Issue #196 is the active source-truth cleanup seam.',
  ]) {
    if (handoff.includes(staleMarker)) failures.push(`ACTIVE_HANDOFF.md still contains stale queue-progress marker: ${staleMarker}`);
  }

  for (const marker of [
    'required_master_bible_closeout:',
    'controlling_pr: 191',
    'routing_authority: FOLDERA_MASTER_BIBLE.md',
    'master_bible_status: canonical_reference_authority',
    'queue_file_status: inactive_reference_only',
    'queue_activation: forbidden_without_explicit_future_activation_issue',
  ]) {
    if (!buildOrder.includes(marker)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing required queue-control marker: ${marker}`);
  }
  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  checkQueueState(failures, queueRaw);

  const sourceMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  for (const marker of [
    '| `FOLDERA_MASTER_BIBLE.md` | `KEEP_REFERENCE_ONLY` |',
    '| `FOLDERA_EXECUTION_QUEUE.yaml` | `KEEP_REFERENCE_ONLY` |',
    '| GitHub issue #196 | `REFERENCE_ONLY` |',
    '| GitHub issue #194 | `CURRENT_CONTROL` |',
    '| `FOLDERA_OPERATING_SYSTEM.md` | `SHIM_TO_CANONICAL` |',
    '| `FOLDERA_LAUNCH_ROADMAP.md` | `SHIM_TO_CANONICAL` |',
    'GitHub issue #181 / PR #191 is the single promotion path for that master-bible execution-layer bundle.',
    'GitHub issue #192 is the completed source-truth closeout issue that aligned the handoff and build-order files around the merged Master Bible.',
    'GitHub issue #196 is the completed source-truth cleanup issue retained for receipt history.',
    'GitHub issue #194 is the current control issue for the first money-loop verdict loop.',
  ]) {
    if (!sourceMap.includes(marker)) failures.push(`docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: ${marker}`);
  }

  failures.push(...checkMasterBible(root));
  failures.push(...checkDraft(root));
  return failures;
}

export function runSourceTruthCheck(root = process.cwd()): string[] {
  const failures: string[] = [];
  let handoff = '';
  let buildOrder = '';
  let queueRaw = '';

  try {
    handoff = readRepoFile(root, 'ACTIVE_HANDOFF.md');
    buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
    queueRaw = readRepoFile(root, 'FOLDERA_EXECUTION_QUEUE.yaml');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) return failures;
  return checkSourceTruth(root, handoff, buildOrder, queueRaw);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runSourceTruthCheck(process.cwd());
  if (failures.length > 0) {
    console.error('Source truth check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Source truth check passed. The Master Bible remains reference authority, the queue remains inactive, and the first money-loop issue is now the active seam.');
}
