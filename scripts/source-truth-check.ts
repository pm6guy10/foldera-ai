import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type QueueItem = {
  id: string;
  status: string;
};

const COMPLETED_RUNG_2_ISSUE = 175;
const COMPLETED_RUNG_3_ISSUE = 179;
const MASTER_BIBLE_ISSUE = 181;
const COMPLETED_VERDICT_LOOP_ISSUE = 194;
const COMPLETED_PAYMENT_PATH_ISSUE = 220;
const COMPLETED_USER_JOURNEY_SHELL_ISSUE = 208;
const COMPLETED_TRUST_RAIL_ISSUE = 216;
const COMPLETED_GLOBAL_RULE_ENFORCEMENT_ISSUE = 182;
const OPEN_THREADS_ISSUE = 165;
const COMPLETED_OPEN_THREADS_ISSUE = 168;
const COMPLETED_COMMAND_OS_ISSUE = 166;
const COMPLETED_MASTER_SYNTHESIS_ISSUE = 170;
const COMPLETED_FIRST_RUNG_ISSUE = 173;
const NEXT_AUTHORIZED_RUNG = 'rung 6 Prove money-ready MVP end to end';
const NEXT_TASK_ID = '006';
const COMPLETED_TASK_IDS = ['001', '002', '003', '004', '005'];
const REQUIRED_TERMINAL_STATES = ['MERGED_AND_CLOSED', 'BLOCKED_WITH_EXACT_RECEIPT', 'HUMAN_REVIEW_REQUIRED_WITH_REASON', 'STOPPED_WITH_AUTHORIZED_REASON'];

const REQUIRED_CLOSED_ISSUES = [121, 131, 99, 48, 140, 147, 151, 154, 159, 163, COMPLETED_COMMAND_OS_ISSUE, COMPLETED_MASTER_SYNTHESIS_ISSUE, COMPLETED_FIRST_RUNG_ISSUE, COMPLETED_RUNG_2_ISSUE, MASTER_BIBLE_ISSUE, COMPLETED_GLOBAL_RULE_ENFORCEMENT_ISSUE, 183, COMPLETED_VERDICT_LOOP_ISSUE, COMPLETED_OPEN_THREADS_ISSUE, COMPLETED_USER_JOURNEY_SHELL_ISSUE, COMPLETED_TRUST_RAIL_ISSUE, COMPLETED_PAYMENT_PATH_ISSUE];

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
  const match = raw.match(/^Issue #(\d+) is the active .* seam\.$/m)
    ?? raw.match(/^Active implementation seam is issue #(\d+).*$/m);
  return match ? Number(match[1]) : null;
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
  if (activeCount !== 0) failures.push(`FOLDERA_EXECUTION_QUEUE.yaml must have zero ACTIVE tasks while the governance patch is active; found ${activeCount}.`);
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
  if (!handoff.includes('Issues #48, #121, #99, #131, #147, #151, #154, #159, #163, #166, #170, #173, #175, #179, #181, #182, #183, #192, #194, and #196 are closed/completed/superseded. Do not reopen them here.')) {
    failures.push('ACTIVE_HANDOFF.md must keep closed/completed/superseded issues, including #181, #182, #183, #192, #194, and #196, out of scope.');
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
  const buildIssueRaw = extractYamlScalar(buildOrder, 'active_issue');
  const handoffIssue = extractActiveHandoffIssue(handoff);

  if (buildIssueRaw !== 'none') failures.push(`FOLDERA_BUILD_ORDER.yaml active_issue must be none (between rungs); found ${buildIssueRaw ?? 'missing'}.`);
  const priority = extractYamlScalar(buildOrder, 'priority_class');
  const workType = extractYamlScalar(buildOrder, 'work_type');
  const nextSeam = extractYamlScalar(buildOrder, 'next_seam');
  if (priority !== 'BETWEEN_RUNGS') failures.push(`FOLDERA_BUILD_ORDER.yaml priority_class must be BETWEEN_RUNGS; found ${priority ?? 'none'}.`);
  if (workType !== 'AWAITING_NEXT_ISSUE') failures.push(`FOLDERA_BUILD_ORDER.yaml work_type must be AWAITING_NEXT_ISSUE; found ${workType ?? 'none'}.`);
  if (!nextSeam || !nextSeam.includes(NEXT_AUTHORIZED_RUNG)) {
    failures.push(`FOLDERA_BUILD_ORDER.yaml next_seam must name rung 6; found ${nextSeam ?? 'none'}.`);
  }

  for (const marker of [
    'Issue #181 is completed by merged PR #191.',
    'Issue #192 is completed by merged PR #193.',
    'Issue #196 is completed by merged PR #197.',
    'Issue #194 is completed by merged PR #201.',
    'Issue #182 is completed/superseded by PR #203.',
    'Issue #168 is completed/superseded by PR #205.',
    'Issue #208 is completed by merged PR #215.',
    'Issue #216 is completed by merged PR #218.',
    'Issue #220 is completed',
    'Issue #178 is suspended/queued and no longer active.',
    `Issue #${OPEN_THREADS_ISSUE} Open Threads remains capture-only and cannot authorize implementation.`,
    'No agent work until then.',
    '`FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.',
    '`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.',
    'PR #189 remains `UNMERGED_DRAFT_CONTEXT_ONLY`.',
    'GitHub writeback is mandatory.',
    'One active seam only.',
  ]) {
    if (!handoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }
  if (handoffIssue !== null) {
    failures.push(`ACTIVE_HANDOFF.md must not declare an active seam (between rungs); found #${handoffIssue}.`);
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
    'No active implementation seam remains after PR #201.',
    'Issue #182 is the active global execution-rule enforcement seam.',
    'Issue #168 is the active automatic Open Threads capture seam.',
    'Issue #168 is the active automatic ChatGPT-to-GitHub switchboard seam.',
    'The next authorized move after this closeout is issue #168 in a separate run.',
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
  const sourceOfTruthOrder = extractYamlList(buildOrder, 'source_of_truth_order');
  for (const entry of [
    'ACTIVE_HANDOFF.md',
    'FOLDERA_BUILD_ORDER.yaml',
    'active GitHub issue',
    'issue #48',
    'GitHub issue #165',
    'GitHub issue #182',
    'GitHub issue #208',
    'GitHub issue #178',
    'GitHub issue #168',
    'FOLDERA_MASTER_BIBLE.md',
    'FOLDERA_NORTH_STAR_LOCK.md',
    'FOLDERA_PRODUCT_OPERATING_SYSTEM.md',
    'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md',
    'FOLDERA_LAUNCH_ROADMAP.md',
  ]) {
    if (!sourceOfTruthOrder.includes(entry)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_of_truth_order entry: ${entry}`);
  }
  for (const marker of [
    'paused_issues:',
    '- issue: 178',
    'state: SUSPENDED',
    'reason: Governance merge clerk paused while the Product MVP becomes the active seam.',
  ]) {
    if (!buildOrder.includes(marker)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing paused issue marker: ${marker}`);
  }
  const acceptedTerminalStates = extractYamlList(buildOrder, 'accepted_terminal_states');
  for (const state of ['MERGED_AND_CLOSED', 'BLOCKED_WITH_EXACT_RECEIPT', 'HUMAN_REVIEW_REQUIRED_WITH_REASON', 'STOPPED_WITH_AUTHORIZED_REASON']) {
    if (!acceptedTerminalStates.includes(state)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing accepted terminal state: ${state}`);
  }
  requireClosedIssueDoNotReopen(failures, handoff, buildOrder);
  checkQueueState(failures, queueRaw);

  const sourceMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  for (const marker of [
    '| `FOLDERA_MASTER_BIBLE.md` | `KEEP_REFERENCE_ONLY` |',
    '| `FOLDERA_EXECUTION_QUEUE.yaml` | `KEEP_REFERENCE_ONLY` |',
    '| GitHub issue #196 | `REFERENCE_ONLY` |',
    '| GitHub issue #182 | `REFERENCE_ONLY` |',
    '| GitHub issue #165 `Open Threads - Foldera Owner Whiteboard` | `CURRENT_CONTROL` |',
    '| GitHub issue #208 | `REFERENCE_ONLY` |',
    '| GitHub issue #216 | `REFERENCE_ONLY` |',
    '| GitHub issue #220 | `REFERENCE_ONLY` |',
    '| GitHub issue #178 | `REFERENCE_ONLY` |',
    '| GitHub issue #140 | `REFERENCE_ONLY` |',
    '| GitHub issue #168 | `REFERENCE_ONLY` |',
    '| GitHub issue #194 | `REFERENCE_ONLY` |',
    '| `FOLDERA_OPERATING_SYSTEM.md` | `SHIM_TO_CANONICAL` |',
    '| `FOLDERA_LAUNCH_ROADMAP.md` | `SHIM_TO_CANONICAL` |',
    'GitHub issue #181 / PR #191 is the single promotion path for that master-bible execution-layer bundle.',
    'GitHub issue #192 is the completed source-truth closeout issue that aligned the handoff and build-order files around the merged Master Bible.',
    'GitHub issue #196 is the completed source-truth cleanup issue retained for receipt history.',
    'GitHub issue #198 / PR #198 restored issue #194 as active control after the cleanup sweep.',
    'GitHub issue #194 / PR #201 completed the first money-loop verdict-loop seam and returned the repo to a no-active-seam state.',
    'GitHub issue #182 is the completed global execution-rule enforcement patch retained for receipt history after PR #203.',
    'GitHub issue #208 is completed by PR #215 (first user journey shell — rung 3 COMPLETE).',
    'GitHub issue #216 is completed by PR #218 (trust/privacy/no-send rail — rung 4 COMPLETE).',
    'GitHub issue #220 is completed',
    'GitHub issue #178 is suspended/queued reference history from the governance pivot.',
    'GitHub issue #140 is completed/closed by PR #206 and is now reference-only.',
    'GitHub issue #168 is the completed automatic Open Threads capture seam retained for receipt history after PR #205.',
    '| `.foldera-contract.json` | `CURRENT_CONTROL` |',
  ]) {
    if (!sourceMap.includes(marker)) failures.push(`docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: ${marker}`);
  }

  const queueAuthorityMarkers = [
    'authority: REFERENCE_ONLY',
    'routing_mode: REFERENCE_ONLY',
    'queue_update_law: Future queue activation requires an explicit activation issue; this file does not control current execution.',
    'Historical queue artifact; issue #194 now controls the first money-loop implementation seam.',
  ];
  for (const marker of queueAuthorityMarkers) {
    if (!queueRaw.includes(marker)) failures.push(`FOLDERA_EXECUTION_QUEUE.yaml is missing required reference-only marker: ${marker}`);
  }
  for (const staleMarker of [
    'authority: SUPREME_EXECUTION_QUEUE',
    'authority_law: FOLDERA_EXECUTION_QUEUE.yaml overrides every other markdown source-truth file for execution routing.',
    'routing_mode: DETERMINISTIC_EXECUTION',
    'Read this file first for execution routing.',
    'Identify the first ACTIVE task.',
    'When proof passes, mark it COMPLETED, move the next QUEUED task to ACTIVE, and continue.',
    'Do not start audits, hygiene passes, or source-truth reconciliation.',
  ]) {
    if (queueRaw.includes(staleMarker)) failures.push(`FOLDERA_EXECUTION_QUEUE.yaml still contains stale queue-authority marker: ${staleMarker}`);
  }

  const contract = JSON.parse(readRepoFile(root, '.foldera-contract.json')) as {
    active?: boolean;
    authority_status?: string;
    backlog_id?: string;
    terminal_state_authority?: { allowed?: unknown; merge_through_rule?: unknown };
    active_issue?: string | number;
  };
  if (contract.active !== false) failures.push('.foldera-contract.json must be inactive (between rungs).');
  if (contract.authority_status !== 'BETWEEN_RUNGS') failures.push('.foldera-contract.json must expose BETWEEN_RUNGS authority status.');
  if (contract.backlog_id !== 'FOLDERA_PRODUCT_MVP_PIVOT') failures.push('.foldera-contract.json must point at FOLDERA_PRODUCT_MVP_PIVOT backlog_id.');
  if (contract.active_issue !== 'none') failures.push(`.foldera-contract.json active_issue must be "none" (between rungs); found ${contract.active_issue ?? 'missing'}.`);
  const terminalAuthority = contract.terminal_state_authority;
  if (!terminalAuthority || !Array.isArray(terminalAuthority.allowed)) failures.push('.foldera-contract.json must expose terminal_state_authority.allowed.');
  else {
    for (const state of REQUIRED_TERMINAL_STATES) {
      if (!terminalAuthority.allowed.includes(state)) failures.push(`.foldera-contract.json is missing terminal state authority for ${state}.`);
    }
  }
  if (typeof terminalAuthority?.merge_through_rule !== 'string' || !terminalAuthority.merge_through_rule.includes('local proof') || !terminalAuthority.merge_through_rule.includes('GitHub checks green')) {
    failures.push('.foldera-contract.json must expose a machine-readable merge-through rule.');
  }

  const productSpecNext = readRepoFile(root, 'FOLDERA_PRODUCT_SPEC_NEXT.md');
  for (const marker of [
    'Authority status: `DRAFT_PRODUCT_SPEC_NOT_ACTIVE`',
    '## Locked Revenue Ladder',
    '`#194` verdict loop proof',
    'durable response/state/receipt loop',
    'bounded self-serve paid path',
    'money-ready MVP proof',
    'first non-owner validation',
  ]) {
    if (!productSpecNext.includes(marker)) failures.push(`FOLDERA_PRODUCT_SPEC_NEXT.md is missing required revenue-ladder marker: ${marker}`);
  }

  const issuePlan = readRepoFile(root, 'FOLDERA_GITHUB_ISSUE_PR_PLAN.md');
  for (const marker of [
    'Authority status: `DRAFT_EXECUTION_PLAN_NOT_ACTIVE`',
    '## Locked Revenue Ladder',
    '`#194` verdict loop proof',
    'Prove money-ready MVP end to end',
    'Prove first non-owner validation',
  ]) {
    if (!issuePlan.includes(marker)) failures.push(`FOLDERA_GITHUB_ISSUE_PR_PLAN.md is missing required revenue-ladder marker: ${marker}`);
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

  console.log('Source truth check passed. Rung 5 (issue #220) is COMPLETE. No active seam — rung 6 needs_issue from Brandon.');
}
