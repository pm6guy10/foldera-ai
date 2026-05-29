import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalSequence = [
  '1. Read `ACTIVE_HANDOFF.md`.',
  '2. Read `FOLDERA_LAUNCH_ROADMAP.md`.',
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
  'CODEX_START.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GPT.md',
  'SYSTEM_RUNBOOK.md',
  'ACCEPTANCE_GATE.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'README.md',
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
      const nextIndex = body.indexOf(line);
      if (nextIndex === -1) {
        failures.push(`${file} is missing boot sequence line: ${line}`);
        continue;
      }
      if (nextIndex < lastIndex) failures.push(`${file} has canonical boot sequence lines out of order.`);
      lastIndex = nextIndex;
    }
  }

  const activeHandoff = readRepoFile(root, 'ACTIVE_HANDOFF.md');
  const activeSeamLines = activeHandoff.match(/^Active implementation seam is issue #\d+.*$/gm) ?? [];
  if (activeSeamLines.length !== 1) failures.push(`ACTIVE_HANDOFF.md must name exactly one active seam line; found ${activeSeamLines.length}.`);
  if (!activeHandoff.includes('FOLDERA_LAUNCH_ROADMAP.md')) failures.push('ACTIVE_HANDOFF.md must reference FOLDERA_LAUNCH_ROADMAP.md.');
  if (!activeHandoff.includes('Issue #48 remains the product contract.')) failures.push('ACTIVE_HANDOFF.md must reference issue #48 as the product contract.');
  for (const rule of requiredWritebackRules) {
    if (!activeHandoff.includes(rule)) failures.push(`ACTIVE_HANDOFF.md is missing required GitHub writeback rule: ${rule}`);
  }

  const buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
  if (!buildOrder.includes('writeback_required: true')) failures.push('FOLDERA_BUILD_ORDER.yaml must set writeback_required: true.');
  if (!buildOrder.includes('source_truth_closeout_required: true')) failures.push('FOLDERA_BUILD_ORDER.yaml must set source_truth_closeout_required: true.');

  const handoffIssue = extractActiveHandoffIssue(activeHandoff);
  const buildOrderIssue = extractYamlNumber(buildOrder, 'active_issue');
  if (handoffIssue === null) failures.push('ACTIVE_HANDOFF.md active seam issue number could not be parsed.');
  if (buildOrderIssue === null) failures.push('FOLDERA_BUILD_ORDER.yaml active_issue could not be parsed.');
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
