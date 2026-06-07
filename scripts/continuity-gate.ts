import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalSequence: Array<string | string[]> = [
  '1. Read `ACTIVE_HANDOFF.md`.',
  ['2. Read `FOLDERA_BUILD_ORDER.yaml`.', '2. Read `FOLDERA_EXECUTION_QUEUE.yaml` when `ACTIVE_HANDOFF.md` says execution is queue-controlled.', '2. Read `FOLDERA_LAUNCH_ROADMAP.md`.'],
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
  'FOLDERA_PRODUCT_OPERATING_SYSTEM.md',
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
  new RegExp(`^\\s*-\\s*${directMainCommand}`, 'im'),
  /^\s*-\s*Never create branches/im,
  /continue to the next highest-leverage seam/i,
  /then continue to the next/i,
  /Default to the main worktree only/i,
];

const staleDocHeaders: Record<string, string[]> = {
  'ACCEPTANCE_GATE.md': ['Authority status: PROOF_GATE'],
  'FOLDERA_OPERATING_SYSTEM.md': ['Authority status: SHIM_TO_CANONICAL'],
  'FOLDERA_LAUNCH_ROADMAP.md': ['Authority status: SHIM_TO_CANONICAL'],
  'FOLDERA_OPERATING_DOCTRINE.md': ['Authority status: SHIM_TO_CANONICAL'],
  'FOLDERA_PRODUCT_SPEC.md': ['Authority status: SHIM_TO_CANONICAL'],
  'FOLDERA_PRODUCTION_BACKLOG.md': ['Authority status: SHIM_TO_CANONICAL'],
  'FOLDERA_MASTER_AUDIT.md': ['Authority status: SHIM_TO_CANONICAL'],
  'FOLDERA_SHIP_SPEC.md': ['Authority status: SHIM_TO_CANONICAL'],
  'WHATS_NEXT.md': ['Authority status: SHIM_TO_CANONICAL'],
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
  'GitHub issue #165',
  'GitHub issue #182',
  'GitHub issue #168',
  'FOLDERA_MASTER_BIBLE.md',
  'FOLDERA_NORTH_STAR_LOCK.md',
  'FOLDERA_PRODUCT_OPERATING_SYSTEM.md',
  'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md',
  'FOLDERA_LAUNCH_ROADMAP.md',
];

const requiredTerminalStates = ['MERGED_AND_CLOSED', 'BLOCKED_WITH_EXACT_RECEIPT', 'HUMAN_REVIEW_REQUIRED_WITH_REASON', 'STOPPED_WITH_AUTHORIZED_REASON'];
const requiredCloseoutFiles = ['ACTIVE_HANDOFF.md', 'FOLDERA_BUILD_ORDER.yaml', 'FOLDERA_LAUNCH_ROADMAP.md', 'docs/SOURCE_OF_TRUTH_MAP.md'];
const requiredCloseoutValues = ['updated', 'unchanged - reason', 'not applicable - reason'];
const requiredReceiptSummaryMarkers: Array<{ marker: string; failure: string }> = [
  { marker: '## Receipt summary', failure: '.github/pull_request_template.md must include a receipt summary section.' },
  { marker: '- Active issue:', failure: '.github/pull_request_template.md must declare the active issue in the receipt summary.' },
  { marker: '- Next authorized move:', failure: '.github/pull_request_template.md must declare the next authorized move in the receipt summary.' },
  { marker: '- Forbidden work touched: YES/NO', failure: '.github/pull_request_template.md must declare forbidden work touched in the receipt summary.' },
  { marker: '- Proof run:', failure: '.github/pull_request_template.md must declare the proof run in the receipt summary.' },
  { marker: '- Checks passed: YES/NO', failure: '.github/pull_request_template.md must declare whether checks passed in the receipt summary.' },
  { marker: '- Merge-through status:', failure: '.github/pull_request_template.md must declare merge-through status in the receipt summary.' },
  {
    marker: '- Terminal state: MERGED_AND_CLOSED / BLOCKED_WITH_EXACT_RECEIPT / HUMAN_REVIEW_REQUIRED_WITH_REASON / STOPPED_WITH_AUTHORIZED_REASON',
    failure: '.github/pull_request_template.md must declare the allowed terminal state set in the receipt summary.',
  },
  { marker: '- Local hook status:', failure: '.github/pull_request_template.md must declare the local hook status in the receipt summary.' },
  {
    marker: '- If bypassed, exact unrelated-route explanation:',
    failure: '.github/pull_request_template.md must require an exact unrelated-route explanation when a local hook is bypassed.',
  },
  { marker: '- Source-truth closeout status:', failure: '.github/pull_request_template.md must declare the source-truth closeout status in the receipt summary.' },
  { marker: '- Stop condition:', failure: '.github/pull_request_template.md must declare the stop condition in the receipt summary.' },
  {
    marker: '- Merge/closeout completed or why not:',
    failure: '.github/pull_request_template.md must declare whether merge/closeout completed or why not in the receipt summary.',
  },
];
const requiredGlobalRuleMarkers: Array<{ marker: string; failure: string }> = [
  { marker: '## Global rule enforcement', failure: '.github/pull_request_template.md must include a global rule enforcement section.' },
  { marker: '- Source truth first:', failure: '.github/pull_request_template.md must require source truth first.' },
  { marker: '- One active seam only:', failure: '.github/pull_request_template.md must require one active seam only.' },
  { marker: '- No chat-only law:', failure: '.github/pull_request_template.md must require the no chat-only law.' },
  { marker: '- First occurrence / second occurrence law:', failure: '.github/pull_request_template.md must require the first occurrence / second occurrence law.' },
  { marker: '- Proof parity law:', failure: '.github/pull_request_template.md must require the proof parity law.' },
  { marker: '- Merge-through completion law:', failure: '.github/pull_request_template.md must require the merge-through completion law.' },
  { marker: '- No owner-as-router law:', failure: '.github/pull_request_template.md must require the no owner-as-router law.' },
  { marker: '- Open thread routing law:', failure: '.github/pull_request_template.md must require the open thread routing law.' },
  { marker: '- Forbidden surface law:', failure: '.github/pull_request_template.md must require the forbidden surface law.' },
  { marker: '- Closeout law:', failure: '.github/pull_request_template.md must require the closeout law.' },
];

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

function detectQueueControlledHandoff(raw: string): boolean {
  return raw.includes('Active implementation seam is `EXECUTION_QUEUE`.')
    && raw.includes('The active seam is now controlled entirely by `FOLDERA_EXECUTION_QUEUE.yaml`.');
}

function extractActiveHandoffIssue(raw: string): number | null {
  const match = raw.match(/^Issue #(\d+) is the active .* seam\.$/m)
    ?? raw.match(/^Active implementation seam is issue #(\d+).*$/m);
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
  const queueControlled = detectQueueControlledHandoff(activeHandoff);
  const activeSeamLines =
    activeHandoff.match(/^Issue #\d+ is the active .* seam\.$/gm)
    ?? activeHandoff.match(/^Active implementation seam is issue #\d+.*$/gm)
    ?? [];
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
  if (activeSeamLines.length !== 1) failures.push(`ACTIVE_HANDOFF.md must name exactly one active seam line; found ${activeSeamLines.length}.`);
  if (!queueControlled && handoffIssue === null) failures.push('ACTIVE_HANDOFF.md active seam issue number could not be parsed.');
  if (buildOrderIssue === null && buildOrderIssueScalar !== 'null') failures.push('FOLDERA_BUILD_ORDER.yaml active_issue could not be parsed.');
  if (!queueControlled && buildOrderIssue === null) failures.push('FOLDERA_BUILD_ORDER.yaml active_issue must name the active governance seam.');
  if (!queueControlled && handoffIssue !== null && buildOrderIssue !== null && handoffIssue !== buildOrderIssue) {
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
  if (contract.active !== true) failures.push('.foldera-contract.json must remain active while it governs the global execution-rule patch.');
  if (contract.authority_status !== 'GLOBAL_RULE_ENFORCEMENT_ACTIVE') failures.push('.foldera-contract.json must expose GLOBAL_RULE_ENFORCEMENT_ACTIVE authority status.');
  if (contract.backlog_id !== 'FOLDERA_GLOBAL_RULE_ENFORCEMENT') failures.push('.foldera-contract.json must point at FOLDERA_GLOBAL_RULE_ENFORCEMENT backlog_id.');
  if (buildOrderIssue !== null && (contract as { active_issue?: number }).active_issue !== buildOrderIssue) {
    failures.push(`.foldera-contract.json active_issue must match FOLDERA_BUILD_ORDER.yaml active_issue #${buildOrderIssue}.`);
  }
  if (contract.superseded_by_issue !== undefined) failures.push('.foldera-contract.json must not report a superseded_by_issue for the active global-rule patch.');
  const contractAny = contract as Record<string, unknown> & { terminal_state_authority?: { allowed?: unknown; merge_through_rule?: unknown } };
  const terminalAuthority = contractAny.terminal_state_authority;
  if (!terminalAuthority || !Array.isArray(terminalAuthority.allowed)) failures.push('.foldera-contract.json must expose terminal_state_authority.allowed.');
  else {
    for (const state of requiredTerminalStates) {
      if (!terminalAuthority.allowed.includes(state)) failures.push(`.foldera-contract.json is missing terminal state authority for ${state}.`);
    }
  }
  if (typeof terminalAuthority?.merge_through_rule !== 'string' || !terminalAuthority.merge_through_rule.includes('local proof') || !terminalAuthority.merge_through_rule.includes('GitHub checks green')) {
    failures.push('.foldera-contract.json must expose a machine-readable merge-through rule.');
  }

  const readme = readRepoFile(root, 'README.md');
  for (const marker of ['create-next-app', 'Learn More', 'Deploy on Vercel']) {
    if (readme.includes(marker)) failures.push(`README.md still contains default boilerplate marker: ${marker}`);
  }

  const prTemplate = readRepoFile(root, '.github/pull_request_template.md');
  for (const { marker, failure } of requiredReceiptSummaryMarkers) {
    if (!prTemplate.includes(marker)) failures.push(failure);
  }
  if (!prTemplate.includes('## Source-truth closeout')) failures.push('.github/pull_request_template.md must include Source-truth closeout section.');
  for (const file of requiredCloseoutFiles) {
    if (!prTemplate.includes(`- \`${file}\`:`)) failures.push(`.github/pull_request_template.md is missing source-truth closeout row for ${file}.`);
  }
  for (const value of requiredCloseoutValues) {
    if (!prTemplate.includes(value)) failures.push(`.github/pull_request_template.md is missing closeout value: ${value}`);
  }
  for (const { marker, failure } of requiredGlobalRuleMarkers) {
    if (!prTemplate.includes(marker)) failures.push(failure);
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
  if (!prTemplate.includes('- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`: cited / updated / unchanged - reason / not applicable - reason')) {
    failures.push('.github/pull_request_template.md must include the Product Operating System traceability row.');
  }

  const sourceTruthMap = readRepoFile(root, 'docs/SOURCE_OF_TRUTH_MAP.md');
  if (!sourceTruthMap.includes('| `FOLDERA_NORTH_STAR_LOCK.md` | `CURRENT_CONTROL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_NORTH_STAR_LOCK.md as CURRENT_CONTROL.');
  }
  if (!sourceTruthMap.includes('| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_PRODUCT_OPERATING_SYSTEM.md as CURRENT_CONTROL.');
  }
  if (!sourceTruthMap.includes('| `FOLDERA_MASTER_BIBLE.md` | `KEEP_REFERENCE_ONLY` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_MASTER_BIBLE.md as KEEP_REFERENCE_ONLY after the closeout sweep.');
  }
  if (!sourceTruthMap.includes('| `FOLDERA_EXECUTION_QUEUE.yaml` | `KEEP_REFERENCE_ONLY` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_EXECUTION_QUEUE.yaml as KEEP_REFERENCE_ONLY when the queue is inactive.');
  }
  if (!sourceTruthMap.includes('| `FOLDERA_EXECUTION_QUEUE.yaml` | `KEEP_REFERENCE_ONLY` | Inactive queue retained for archaeology; supreme-authority language is neutralized in-file and a future activation issue is required to re-authorize queue control.')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must keep FOLDERA_EXECUTION_QUEUE.yaml as the historical shim row.');
  }
  if (!sourceTruthMap.includes('| GitHub issue #182 | `REFERENCE_ONLY` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify GitHub issue #182 as REFERENCE_ONLY after the closeout.');
  }
  if (!sourceTruthMap.includes('| GitHub issue #165 `Open Threads - Foldera Owner Whiteboard` | `CURRENT_CONTROL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify GitHub issue #165 as CURRENT_CONTROL for the raw-input inbox.');
  }
  if (!sourceTruthMap.includes('| GitHub issue #168 | `CURRENT_CONTROL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify GitHub issue #168 as CURRENT_CONTROL for the active switchboard seam.');
  }
  if (!sourceTruthMap.includes('| GitHub issue #194 | `REFERENCE_ONLY` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify GitHub issue #194 as REFERENCE_ONLY after PR #201 closes the verdict loop.');
  }
  if (!sourceTruthMap.includes('| `.foldera-contract.json` | `CURRENT_CONTROL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify .foldera-contract.json as CURRENT_CONTROL for the global execution-rule patch.');
  }
  if (!sourceTruthMap.includes('| `FOLDERA_OPERATING_SYSTEM.md` | `SHIM_TO_CANONICAL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_OPERATING_SYSTEM.md as SHIM_TO_CANONICAL.');
  }
  if (!sourceTruthMap.includes('| `FOLDERA_LAUNCH_ROADMAP.md` | `SHIM_TO_CANONICAL` |')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_LAUNCH_ROADMAP.md as SHIM_TO_CANONICAL.');
  }
  if (!sourceTruthMap.includes('GitHub issue #182 is the completed global execution-rule enforcement patch retained for receipt history after PR #203.')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must record issue #182 as the completed global execution-rule enforcement patch.');
  }
  if (!sourceTruthMap.includes('GitHub issue #168 is the current control issue for the automatic Open Threads capture and lessons-learned recurrence enforcement seam.')) {
    failures.push('docs/SOURCE_OF_TRUTH_MAP.md must record issue #168 as the current control issue.');
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
