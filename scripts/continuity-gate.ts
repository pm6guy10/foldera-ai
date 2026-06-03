import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalSequence: Array<string | string[]> = [
  '1. Read `ACTIVE_HANDOFF.md`.',
  ['2. Read `FOLDERA_BUILD_ORDER.yaml`.', '2. Read `FOLDERA_LAUNCH_ROADMAP.md`.'],
  '3. Read the active issue named by `ACTIVE_HANDOFF.md`.',
  '4. Read issue #48 for product doctrine.',
  '5. Read relevant execution/proof docs only for the active seam.',
  '6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.',
  '7. Use Vercel/Supabase only when the seam requires live/runtime truth.',
];

const requiredFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_LAUNCH_ROADMAP.md',
  'FOLDERA_OPERATING_SYSTEM.md',
  'FOLDERA_NORTH_STAR_LOCK.md',
  'CODEX_START.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GPT.md',
  'SYSTEM_RUNBOOK.md',
  'ACCEPTANCE_GATE.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'README.md',
  '.cursorrules',
  '.cursor/rules/agent.mdc',
  '.github/pull_request_template.md',
  '.github/workflows/pr-sentinel.yml',
];

const bootDocs = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_LAUNCH_ROADMAP.md',
  'FOLDERA_OPERATING_SYSTEM.md',
  'CODEX_START.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GPT.md',
  'SYSTEM_RUNBOOK.md',
  '.cursorrules',
];

const agentGovernanceDocs = ['AGENTS.md', 'CODEX_START.md', 'CLAUDE.md', 'GPT.md', '.cursorrules', '.cursor/rules/agent.mdc'];

const requiredAgentGovernanceRules: Array<{ label: string; variants: string[] }> = [
  { label: 'GitHub source truth beats chat memory', variants: ['GitHub source truth beats chat memory', 'GitHub repo files and GitHub issues beat chat memory'] },
  { label: 'one active seam only', variants: ['One active seam only', 'one active seam only'] },
  { label: 'PR-based workflow only', variants: ['PR-based workflow only', 'PR workflow', 'PR path'] },
  { label: 'no direct main edits', variants: ['No direct edits to `main`', 'Do not bypass PR review/checks', 'use the PR path for meaningful repo changes'] },
  { label: 'no automatic continuation', variants: ['No automatic continuation', 'no automatic continuation', 'Do not execute multiple product changes'] },
  { label: 'source-truth closeout', variants: ['Source-truth closeout', 'source-truth closeout'] },
  { label: 'GitHub issue receipt', variants: ['GitHub issue receipt', 'GitHub receipt'] },
  { label: 'Brandon relay protection', variants: ['Brandon must not be the relay', 'Do not ask Brandon to relay', 'do not make Brandon relay'] },
];

const directMainCommand = ['Push', 'directly', 'to', '`?main`?'].join(' ');

const forbiddenAgentGovernancePatterns = [
  new RegExp(`^\s*-\s*${directMainCommand}`, 'im'),
  /^\s*-\s*Never create branches/im,
  /continue to the next highest-leverage seam/i,
  /then continue to the next/i,
  /Default to the main worktree only/i,
];

const staleDocHeaders: Record<string, string[]> = {
  'ACCEPTANCE_GATE.md': ['Authority status: PROOF_GATE'],
  'FOLDERA_PRODUCT_SPEC.md': ['Authority status: REFERENCE_ONLY'],
  'FOLDERA_PRODUCTION_BACKLOG.md': ['Authority status: REFERENCE_ONLY'],
  'FOLDERA_MASTER_AUDIT.md': ['Authority status: REFERENCE_ONLY'],
  'FOLDERA_SHIP_SPEC.md': ['Authority status: HISTORICAL_ARCHIVE'],
  'WHATS_NEXT.md': ['Authority status: HISTORICAL_ARCHIVE'],
};

const requiredWritebackRules = [
  'GitHub writeback before stop is mandatory.',
  'Chat memory is not source of truth.',
  'If work was done and not written to GitHub, the transaction is incomplete.',
  'Every PR must close source truth before stop.',
  '`ACTIVE_HANDOFF.md` must be updated when the active seam, proof status, next seam, or blocker changes.',
  '`FOLDERA_BUILD_ORDER.yaml` must be updated when the active issue, paused issue list, priority class, or work type changes.',
  'If a source-truth file is not updated, the PR receipt must say `unchanged - reason` or `not applicable - reason`.',
];

const requiredCodexRunLedgerRules = [
  '## MANDATORY CODEX RUN LEDGER CLOSEOUT',
  'Every Codex run must end with a durable GitHub closeout record.',
  'The run is not complete until GitHub contains the closeout.',
  'Find one open issue titled exactly: `[OPS] Codex Run Ledger`.',
  'Generate one `RUN_ID` using this format:',
  'codex-YYYYMMDD-HHMMSSZ-issue-###-pr-###-shortsha',
  'Post the primary work-surface receipt.',
  'Post the ledger receipt.',
  'Return only both GitHub receipt URLs to Brandon.',
];

const requiredSourceOfTruthOrder = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'active GitHub issue',
  'issue #48',
  'FOLDERA_LAUNCH_ROADMAP.md',
];

const requiredTerminalStates = ['BLOCKED', 'PROOF', 'PR OPENED', 'MERGE READY', 'STOPPED'];
const requiredCloseoutFiles = ['ACTIVE_HANDOFF.md', 'FOLDERA_BUILD_ORDER.yaml', 'FOLDERA_LAUNCH_ROADMAP.md', 'docs/SOURCE_OF_TRUTH_MAP.md'];
const requiredCloseoutValues = ['updated', 'unchanged - reason', 'not applicable - reason'];

function readRepoFile(root: string, file: string): string {
  return readFileSync(join(root, file), 'utf8');
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

export function runContinuityGate(root: string): string[] {
  const failures: string[] = [];

  for (const file of requiredFiles) {
    if (!existsSync(join(root, file))) failures.push(`Missing required source-truth file: ${file}`);
  }

  for (const file of bootDocs) {
    const body = readRepoFile(root, file);
    if (!body.includes('## Canonical Boot Sequence')) {
      failures.push(`${file} is missing the Canonical Boot Sequence section.`);
      continue;
    }
    let lastIndex = -1;
    for (const line of canonicalSequence) {
      if (Array.isArray(line)) {
        const variantIndexes = line.map((variant) => body.indexOf(variant)).filter((index) => index !== -1);
        if (variantIndexes.length === 0) {
          failures.push(`${file} is missing boot sequence line: one of ${line.join(' OR ')}`);
          continue;
        }
        const nextIndex = Math.min(...variantIndexes);
        if (nextIndex < lastIndex) failures.push(`${file} has canonical boot sequence lines out of order.`);
        lastIndex = nextIndex;
        continue;
      }

      const nextIndex = body.indexOf(line);
      if (nextIndex === -1) {
        failures.push(`${file} is missing boot sequence line: ${line}`);
        continue;
      }
      if (nextIndex < lastIndex) failures.push(`${file} has canonical boot sequence lines out of order.`);
      lastIndex = nextIndex;
    }
  }

  for (const file of agentGovernanceDocs) {
    const body = readRepoFile(root, file);
    for (const rule of requiredAgentGovernanceRules) {
      if (!rule.variants.some((variant) => body.includes(variant))) failures.push(`${file} is missing required agent governance rule: ${rule.label}`);
    }
    for (const pattern of forbiddenAgentGovernancePatterns) {
      if (pattern.test(body)) failures.push(`${file} contains forbidden agent governance language: ${pattern.source}`);
    }
  }

  const activeHandoff = readRepoFile(root, 'ACTIVE_HANDOFF.md');
  const activeSeamLines = activeHandoff.match(/^Active implementation seam is issue #\d+.*$/gm) ?? [];
  if (!activeHandoff.includes('FOLDERA_BUILD_ORDER.yaml')) failures.push('ACTIVE_HANDOFF.md must reference FOLDERA_BUILD_ORDER.yaml.');
  if (!activeHandoff.includes('Issue #48 remains the product contract.')) failures.push('ACTIVE_HANDOFF.md must reference issue #48 as the product contract.');
  for (const rule of requiredWritebackRules) {
    if (!activeHandoff.includes(rule)) failures.push(`ACTIVE_HANDOFF.md is missing required GitHub writeback rule: ${rule}`);
  }

  const agents = readRepoFile(root, 'AGENTS.md');
  for (const rule of requiredCodexRunLedgerRules) {
    if (!agents.includes(rule)) failures.push(`AGENTS.md is missing required Codex run ledger rule: ${rule}`);
  }

  const buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
  if (!buildOrder.includes('writeback_required: true')) failures.push('FOLDERA_BUILD_ORDER.yaml must set writeback_required: true.');
  if (!buildOrder.includes('source_truth_closeout_required: true')) failures.push('FOLDERA_BUILD_ORDER.yaml must set source_truth_closeout_required: true.');

  const handoffIssue = extractActiveHandoffIssue(activeHandoff);
  const buildOrderIssue = extractYamlNumber(buildOrder, 'active_issue');
  const buildOrderIssueScalar = extractYamlScalar(buildOrder, 'active_issue');
  const oldPost145Blocked = /Next seam:\s*blocked - reason:\s*no next seam assigned after PR #145 merge/i.test(activeHandoff)
    && /next_seam:\s*blocked - reason no next seam assigned after PR #145 merge/i.test(buildOrder)
    && buildOrderIssueScalar === 'null';
  const post159BlockedUntilEvidence = activeHandoff.includes('No active implementation seam is assigned.')
    && activeHandoff.includes('Issue #159 is complete: PR #161 created `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`')
    && activeHandoff.includes('Next seam: blocked - reason: no next growth/product seam is authorized until real first-10 ICP evidence exists in `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`.')
    && buildOrder.includes('priority_class: BLOCKED_NO_ACTION_SAFE')
    && buildOrder.includes('work_type: SOURCE_TRUTH_CLOSEOUT_POST_159')
    && buildOrder.includes('next_seam: blocked - reason no next growth/product seam is authorized until real first-10 ICP evidence exists in docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md')
    && buildOrderIssueScalar === 'null';
  const nextSeamBlocked = oldPost145Blocked || post159BlockedUntilEvidence;
  if (buildOrderIssueScalar === 'null' && !nextSeamBlocked) {
    failures.push('ACTIVE_HANDOFF.md and FOLDERA_BUILD_ORDER.yaml must agree on the post-#159 blocked-until-evidence state.');
  }
  if (nextSeamBlocked) {
    if (activeSeamLines.length !== 0) failures.push(`ACTIVE_HANDOFF.md must name zero active seam lines when next seam is blocked; found ${activeSeamLines.length}.`);
  } else {
    if (activeSeamLines.length !== 1) failures.push(`ACTIVE_HANDOFF.md must name exactly one active seam line; found ${activeSeamLines.length}.`);
    if (handoffIssue === null) failures.push('ACTIVE_HANDOFF.md active seam issue number could not be parsed.');
    if (buildOrderIssue === null) failures.push('FOLDERA_BUILD_ORDER.yaml active_issue could not be parsed.');
  }
  if (handoffIssue !== null && buildOrderIssue !== null && handoffIssue !== buildOrderIssue) {
    failures.push(`ACTIVE_HANDOFF.md active seam issue #${handoffIssue} must match FOLDERA_BUILD_ORDER.yaml active_issue #${buildOrderIssue}.`);
  }

  const sourceOfTruthOrder = extractYamlList(buildOrder, 'source_of_truth_order');
  if (sourceOfTruthOrder.length === 0) failures.push('FOLDERA_BUILD_ORDER.yaml is missing source_of_truth_order.');
  for (const entry of requiredSourceOfTruthOrder) {
    if (!sourceOfTruthOrder.includes(entry)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_of_truth_order entry: ${entry}`);
  }

  const acceptedTerminalStates = extractYamlList(buildOrder, 'accepted_terminal_states');
  if (acceptedTerminalStates.length === 0) failures.push('FOLDERA_BUILD_ORDER.yaml is missing accepted_terminal_states.');
  for (const state of requiredTerminalStates) {
    if (!acceptedTerminalStates.includes(state)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing accepted terminal state: ${state}`);
  }

  const closeoutValues = extractYamlList(buildOrder, 'source_truth_closeout_values');
  for (const value of requiredCloseoutValues) {
    if (!closeoutValues.includes(value)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_truth_closeout_values entry: ${value}`);
  }
  for (const file of requiredCloseoutFiles) {
    if (!buildOrder.includes(`${file}: updated / unchanged - reason / not applicable - reason`)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing closeout requirement for ${file}.`);
  }
  if (!buildOrder.includes('next_seam: named / blocked - reason')) failures.push('FOLDERA_BUILD_ORDER.yaml must require next_seam closeout.');

  for (const [file, requiredMarkers] of Object.entries(staleDocHeaders)) {
    const firstLines = readRepoFile(root, file).split(/\r?\n/).slice(0, 12).join('\n');
    for (const marker of requiredMarkers) {
      if (!firstLines.includes(marker)) failures.push(`${file} is missing top authority marker: ${marker}`);
    }
  }

  const contract = JSON.parse(readRepoFile(root, '.foldera-contract.json')) as { active?: boolean; authority_status?: string; backlog_id?: string; superseded_by_issue?: number };
  if (contract.backlog_id?.startsWith('ISSUE_62') && contract.active !== false) failures.push('.foldera-contract.json points at old issue #62 but is not marked active=false.');
  if (contract.backlog_id?.startsWith('ISSUE_62') && contract.authority_status !== 'STALE_REMOVE_OR_ARCHIVE') failures.push('.foldera-contract.json points at old issue #62 but lacks STALE_REMOVE_OR_ARCHIVE status.');
  if (contract.backlog_id?.startsWith('ISSUE_62') && contract.superseded_by_issue !== 80) failures.push('.foldera-contract.json stale status must cite issue #80 as the cleanup authority.');

  const readme = readRepoFile(root, 'README.md');
  for (const marker of ['create-next-app', 'Learn More', 'Deploy on Vercel']) {
    if (readme.includes(marker)) failures.push(`README.md still contains default boilerplate marker: ${marker}`);
  }

  const prTemplate = readRepoFile(root, '.github/pull_request_template.md');
  if (!prTemplate.includes('## Source-truth closeout')) failures.push('.github/pull_request_template.md must include Source-truth closeout section.');
  for (const file of requiredCloseoutFiles) {
    if (!prTemplate.includes(`- \`${file}\`:`)) failures.push(`.github/pull_request_template.md is missing source-truth closeout row for ${file}.`);
  }
  for (const value of requiredCloseoutValues) {
    if (!prTemplate.includes(value)) failures.push(`.github/pull_request_template.md is missing closeout value: ${value}`);
  }
  if (!prTemplate.includes('## Next seam')) failures.push('.github/pull_request_template.md must require a Next seam section.');
  if (!prTemplate.includes('No PR is complete until this section explains why the scoreboard changed or why it did not need to change.')) {
    failures.push('.github/pull_request_template.md must state the scoreboard closeout rule.');
  }
  if (!prTemplate.includes('North Star traceability for product/business/UX/runtime direction')) {
    failures.push('.github/pull_request_template.md must require North Star traceability when direction is implicated.');
  }
  if (!prTemplate.includes('- `FOLDERA_NORTH_STAR_LOCK.md`: cited / updated / unchanged - reason / not applicable - reason')) {
    failures.push('.github/pull_request_template.md must include the North Star traceability row.');
  }

  const sourceTruthMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  if (!sourceTruthMap.includes('| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_NORTH_STAR_LOCK.md as CURRENT_CONTROL.');
  }

  const sentinel = readRepoFile(root, '.github/workflows/pr-sentinel.yml');
  if (!sentinel.includes('npm run gate:continuity')) failures.push('PR Sentinel must run npm run gate:continuity.');
  const packageJson = JSON.parse(readRepoFile(root, 'package.json')) as { scripts?: Record<string, string> };
  if (!packageJson.scripts?.['gate:continuity']) failures.push('package.json is missing scripts.gate:continuity.');

  return failures;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = runContinuityGate(process.cwd());
  if (failures.length > 0) {
    console.error('Continuity gate failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Continuity gate passed.');
}
