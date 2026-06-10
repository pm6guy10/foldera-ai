import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Governance Collapse v1 (issue #240): this gate enforces a small, fixed truth
// surface instead of prose parity across many documents.
//
// The anti-regrowth rule is mechanical: the root of the repo may contain at
// most MAX_ROOT_MARKDOWN_FILES markdown files. New governance rules must be
// added by editing an existing keep-list file, never by creating a new file.

export const MAX_ROOT_MARKDOWN_FILES = 8;

export const ROOT_KEEP_MARKDOWN = [
  'ACTIVE_HANDOFF.md',
  'AGENTS.md',
  'CLAUDE.md',
  'FOLDERA_MASTER_BIBLE.md',
  'README.md',
  'SESSION_HISTORY.md',
  'LESSONS_LEARNED.md',
];

const requiredFiles = [
  ...ROOT_KEEP_MARKDOWN,
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  '.github/pull_request_template.md',
  '.github/workflows/pr-sentinel.yml',
];

const ACTIVE_HANDOFF_MAX_LINES = 80;

const requiredCloseoutValues = ['updated', 'unchanged - reason', 'not applicable - reason'];
const requiredCloseoutFiles = ['ACTIVE_HANDOFF.md', 'FOLDERA_BUILD_ORDER.yaml', 'docs/SOURCE_OF_TRUTH_MAP.md'];
const requiredTerminalStates = ['MERGED_AND_CLOSED', 'BLOCKED_WITH_EXACT_RECEIPT', 'HUMAN_REVIEW_REQUIRED_WITH_REASON', 'STOPPED_WITH_AUTHORIZED_REASON'];

function readRepoFile(root: string, file: string): string {
  return readFileSync(join(root, file), 'utf8');
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
  const match = raw.match(/^Issue #(\d+) is the active .* seam\.$/m)
    ?? raw.match(/^Active implementation seam is issue #(\d+).*$/m);
  return match ? Number(match[1]) : null;
}

export function runContinuityGate(root: string): string[] {
  const failures: string[] = [];

  for (const file of requiredFiles) {
    if (!existsSync(join(root, file))) failures.push(`Missing required source-truth file: ${file}`);
  }
  if (failures.length > 0) return failures;

  // Anti-regrowth rule: bounded root markdown surface.
  const rootMarkdown = readdirSync(root).filter((name) => name.toLowerCase().endsWith('.md'));
  if (rootMarkdown.length > MAX_ROOT_MARKDOWN_FILES) {
    const extras = rootMarkdown.filter((name) => !ROOT_KEEP_MARKDOWN.includes(name));
    failures.push(
      `Root markdown file count is ${rootMarkdown.length}; maximum is ${MAX_ROOT_MARKDOWN_FILES}. ` +
      `New governance rules must be added by editing an existing keep-list file, never by creating a new file. ` +
      `Unexpected: ${extras.join(', ')}`,
    );
  }

  // ACTIVE_HANDOFF.md: one seam, parseable, bounded.
  const activeHandoff = readRepoFile(root, 'ACTIVE_HANDOFF.md');
  const handoffLineCount = activeHandoff.split(/\r?\n/).length;
  if (handoffLineCount > ACTIVE_HANDOFF_MAX_LINES) {
    failures.push(`ACTIVE_HANDOFF.md is ${handoffLineCount} lines; keep it at <= ${ACTIVE_HANDOFF_MAX_LINES} lines.`);
  }
  for (const marker of ['# ACTIVE HANDOFF', 'Current slice:', '## Next exact move', 'GitHub writeback before stop is mandatory.']) {
    if (!activeHandoff.includes(marker)) failures.push(`ACTIVE_HANDOFF.md is missing required marker: ${marker}`);
  }

  const buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
  if (!buildOrder.includes('writeback_required: true')) failures.push('FOLDERA_BUILD_ORDER.yaml must set writeback_required: true.');
  for (const value of requiredCloseoutValues) {
    if (!buildOrder.includes(value)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing source_truth_closeout value: ${value}`);
  }
  for (const state of requiredTerminalStates) {
    if (!buildOrder.includes(state)) failures.push(`FOLDERA_BUILD_ORDER.yaml is missing accepted terminal state: ${state}`);
  }

  const handoffIssue = extractActiveHandoffIssue(activeHandoff);
  const activeSeamLines =
    activeHandoff.match(/^Issue #\d+ is the active .* seam\.$/gm)
    ?? activeHandoff.match(/^Active implementation seam is issue #\d+.*$/gm)
    ?? [];
  const buildOrderIssue = extractYamlNumber(buildOrder, 'active_issue');
  const buildOrderIssueScalar = extractYamlScalar(buildOrder, 'active_issue');
  const betweenRungs = buildOrderIssueScalar === 'none';

  if (betweenRungs) {
    if (activeSeamLines.length !== 0) failures.push(`ACTIVE_HANDOFF.md must not declare an active seam in between-rungs state; found ${activeSeamLines.length}.`);
  } else {
    if (activeSeamLines.length !== 1) failures.push(`ACTIVE_HANDOFF.md must name exactly one active seam line; found ${activeSeamLines.length}.`);
    if (handoffIssue === null) failures.push('ACTIVE_HANDOFF.md active seam issue number could not be parsed.');
    if (buildOrderIssue === null) failures.push('FOLDERA_BUILD_ORDER.yaml active_issue must name the active seam.');
    if (handoffIssue !== null && buildOrderIssue !== null && handoffIssue !== buildOrderIssue) {
      failures.push(`ACTIVE_HANDOFF.md active seam issue #${handoffIssue} must match FOLDERA_BUILD_ORDER.yaml active_issue #${buildOrderIssue}.`);
    }
  }

  // Contract parity.
  const contract = JSON.parse(readRepoFile(root, '.foldera-contract.json')) as {
    active_issue?: string | number;
    terminal_state_authority?: { allowed?: unknown };
  };
  if (betweenRungs) {
    if (contract.active_issue !== 'none') failures.push(`.foldera-contract.json active_issue must be "none" in between-rungs state; found ${contract.active_issue ?? 'missing'}.`);
  } else if (buildOrderIssue !== null && contract.active_issue !== buildOrderIssue) {
    failures.push(`.foldera-contract.json active_issue must match FOLDERA_BUILD_ORDER.yaml active_issue #${buildOrderIssue}.`);
  }
  const terminalAuthority = contract.terminal_state_authority;
  if (!terminalAuthority || !Array.isArray(terminalAuthority.allowed)) {
    failures.push('.foldera-contract.json must expose terminal_state_authority.allowed.');
  }

  // PR template closeout.
  const prTemplate = readRepoFile(root, '.github/pull_request_template.md');
  if (!prTemplate.includes('## Source-truth closeout')) failures.push('.github/pull_request_template.md must include Source-truth closeout section.');
  for (const file of requiredCloseoutFiles) {
    if (!prTemplate.includes(`- \`${file}\`:`)) failures.push(`.github/pull_request_template.md is missing source-truth closeout row for ${file}.`);
  }
  for (const value of requiredCloseoutValues) {
    if (!prTemplate.includes(value)) failures.push(`.github/pull_request_template.md is missing closeout value: ${value}`);
  }
  if (!prTemplate.includes('## Next seam')) failures.push('.github/pull_request_template.md must require a Next seam section.');

  // Enforcement wiring.
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
