import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_FILES = [
  'FOLDERA_PRODUCTION_BACKLOG.md',
  'ACCEPTANCE_GATE.md',
  'SESSION_HISTORY.md',
] as const;

const CONTROLLER_OWNED_PATHS = new Set([
  'package.json',
  'scripts/controller-autopilot.ts',
  'scripts/__tests__/controller-autopilot.test.ts',
]);

const SOURCE_OF_TRUTH_PATHS = new Set([
  'FOLDERA_PRODUCTION_BACKLOG.md',
  'SESSION_HISTORY.md',
  'CURRENT_STATE.md',
  'ACCEPTANCE_GATE.md',
  'SYSTEM_RUNBOOK.md',
  'FOLDERA_MASTER_AUDIT.md',
  'AGENTS.md',
  'CLAUDE.md',
]);

export interface DirtyEntry {
  status: string;
  path: string;
  raw: string;
}

export interface ClassifiedDirtyEntry extends DirtyEntry {
  classification: 'SAFE GENERATED' | 'CONTROLLER OWNED' | 'BLOCKING';
  reason: string;
}

export interface DirtyClassification {
  safeGenerated: ClassifiedDirtyEntry[];
  controllerOwned: ClassifiedDirtyEntry[];
  blocking: ClassifiedDirtyEntry[];
}

export interface BacklogItem {
  headingId: string;
  id: string;
  rung: string | null;
  title: string | null;
  userFacingPath: string | null;
  startingTrigger: string | null;
  endingSuccessState: string | null;
  problem: string | null;
  protectedContracts: string | null;
  allowedFiles: string | null;
  forbiddenFiles: string | null;
  requiredLocalProof: string | null;
  requiredProductionProof: string | null;
  doneMeans: string | null;
  doNotCount: string | null;
  status: string | null;
  nextBlocker: string | null;
}

export interface SessionHistoryEntry {
  heading: string;
  summaryLines: string[];
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function compact(value: string | null | undefined, max = 180): string {
  const normalized = (value ?? 'UNKNOWN').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'UNKNOWN';
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractField(block: string, label: string): string | null {
  const match = block.match(new RegExp(`^${escapeRegex(label)}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function isSafeGeneratedPath(path: string): boolean {
  const normalized = normalizeRepoPath(path);
  const basename = normalized.split('/').at(-1) ?? normalized;

  return (
    normalized.startsWith('.screenshots/') ||
    normalized.startsWith('test-results/') ||
    normalized.startsWith('playwright-report/') ||
    normalized.startsWith('blob-report/') ||
    normalized === 'tests/production/audit-report.json' ||
    normalized === 'tests/production/audit-summary.md' ||
    basename.startsWith('tmp_') ||
    basename.endsWith('.log')
  );
}

function getBlockingReason(path: string): string {
  if (path.startsWith('app/')) return 'dirty app/ source path';
  if (path.startsWith('lib/')) return 'dirty lib/ source path';
  if (path.startsWith('scripts/')) return 'dirty scripts/ path outside controller autopilot seam';
  if (path.startsWith('tests/')) return 'dirty tests/ path';
  if (path === 'package.json') return 'dirty package.json outside safe-generated allowlist';
  if (path === 'package-lock.json') return 'dirty package-lock.json outside safe-generated allowlist';
  if (SOURCE_OF_TRUTH_PATHS.has(path) || path.startsWith('docs/')) {
    return 'dirty backlog or source-of-truth file';
  }
  return 'dirty file outside safe-generated allowlist';
}

export function parseGitStatusShort(output: string): DirtyEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || line.slice(0, 2);
      const rawPath = line.slice(3).trim();
      const path = rawPath.includes(' -> ')
        ? rawPath.split(' -> ').at(-1) ?? rawPath
        : rawPath;

      return {
        status,
        path: normalizeRepoPath(path),
        raw: line,
      };
    });
}

export function classifyDirtyEntries(entries: readonly DirtyEntry[]): DirtyClassification {
  const safeGenerated: ClassifiedDirtyEntry[] = [];
  const controllerOwned: ClassifiedDirtyEntry[] = [];
  const blocking: ClassifiedDirtyEntry[] = [];

  for (const entry of entries) {
    if (isSafeGeneratedPath(entry.path)) {
      safeGenerated.push({
        ...entry,
        classification: 'SAFE GENERATED',
        reason: 'generated artifact allowlist',
      });
      continue;
    }

    if (CONTROLLER_OWNED_PATHS.has(entry.path)) {
      controllerOwned.push({
        ...entry,
        classification: 'CONTROLLER OWNED',
        reason: 'intended controller-autopilot change file',
      });
      continue;
    }

    blocking.push({
      ...entry,
      classification: 'BLOCKING',
      reason: getBlockingReason(entry.path),
    });
  }

  return { safeGenerated, controllerOwned, blocking };
}

export function parseBacklogItems(markdown: string): BacklogItem[] {
  const matches = [...markdown.matchAll(/^###\s+(BL-\d+)\s*$/gm)];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end).trim();
    const headingId = match[1];

    return {
      headingId,
      id: extractField(block, 'ID') ?? headingId,
      rung: extractField(block, 'Rung'),
      title: extractField(block, 'Title'),
      userFacingPath: extractField(block, 'User-facing path'),
      startingTrigger: extractField(block, 'Starting route or trigger'),
      endingSuccessState: extractField(block, 'Ending success state'),
      problem: extractField(block, 'Problem'),
      protectedContracts: extractField(block, 'Protected contracts'),
      allowedFiles: extractField(block, 'Allowed files'),
      forbiddenFiles: extractField(block, 'Forbidden files'),
      requiredLocalProof: extractField(block, 'Required local proof'),
      requiredProductionProof: extractField(block, 'Required production proof'),
      doneMeans: extractField(block, 'Done means'),
      doNotCount: extractField(block, 'Do-not-count'),
      status: extractField(block, 'Status'),
      nextBlocker: extractField(block, 'Next blocker'),
    };
  });
}

export function findFirstOpenBacklogItem(items: readonly BacklogItem[]): BacklogItem | null {
  return items.find((item) => item.status?.trim().toUpperCase() === 'OPEN') ?? null;
}

export function findWaitingPassiveProofBacklogItems(
  items: readonly BacklogItem[],
): BacklogItem[] {
  return items.filter(
    (item) => item.status?.trim().toUpperCase() === 'WAITING_PASSIVE_PROOF',
  );
}

export function findWaitingExternalQuotaBacklogItems(
  items: readonly BacklogItem[],
): BacklogItem[] {
  return items.filter(
    (item) => item.status?.trim().toUpperCase() === 'WAITING_EXTERNAL_QUOTA',
  );
}

export function parseSessionHistoryEntries(markdown: string): SessionHistoryEntry[] {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(start, end).trim();
    const lines = block.split(/\r?\n/).slice(1);
    const summaryLines = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .slice(0, 2);

    return {
      heading: match[1].trim(),
      summaryLines,
    };
  });
}

function readRequiredFile(repoRoot: string, relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function printDirtyGroup(title: string, entries: readonly ClassifiedDirtyEntry[]) {
  console.log(title);
  if (entries.length === 0) {
    console.log('- none');
    return;
  }

  for (const entry of entries) {
    console.log(`- ${entry.path} [${entry.status}] - ${entry.reason}`);
  }
}

function printWaitingPassiveProofItems(items: readonly BacklogItem[]) {
  console.log('WAITING PASSIVE PROOF ITEMS:');
  if (items.length === 0) {
    console.log('- none');
    return;
  }

  for (const item of items) {
    console.log(`- ${item.id} — ${compact(item.nextBlocker ?? 'passive proof pending', 120)}`);
  }
}

function printWaitingExternalBlockerItems(items: readonly BacklogItem[]) {
  console.log('WAITING EXTERNAL BLOCKER ITEMS:');
  if (items.length === 0) {
    console.log('- none');
    return;
  }

  for (const item of items) {
    console.log(`- ${item.id} — ${compact(item.nextBlocker ?? 'external blocker pending', 120)}`);
  }
}

function buildStopCondition(item: BacklogItem | null, acceptanceGateText: string): string {
  const acceptanceGateRule =
    acceptanceGateText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('If Codex cannot prove that at least one production rung advanced')) ??
    'Stop if the proof path cannot advance one production rung.';

  if (item?.doNotCount) {
    return `${compact(item.doNotCount, 220)} ${acceptanceGateRule}`;
  }

  return acceptanceGateRule;
}

function printRecentSessionHistory(entries: readonly SessionHistoryEntry[]) {
  console.log('RECENT SESSION HISTORY');
  if (entries.length === 0) {
    console.log('- No parseable ## session-history entries found.');
    return;
  }

  for (const entry of entries) {
    console.log(`- ${entry.heading}`);
    if (entry.summaryLines.length === 0) {
      console.log('  No summary bullets found.');
      continue;
    }

    for (const line of entry.summaryLines) {
      console.log(`  ${line}`);
    }
  }
}

function printSeamContractReport(item: BacklogItem | null, acceptanceGateText: string) {
  console.log('SEAM CONTRACT REPORT');
  console.log(`- Backlog ID: ${item?.id ?? 'UNKNOWN'}`);
  console.log(`- Title: ${compact(item?.title)}`);
  console.log(`- Rung: ${item?.rung ?? 'UNKNOWN'}`);
  console.log(`- User-facing path protected: ${compact(item?.userFacingPath)}`);
  console.log(`- Starting trigger/route: ${compact(item?.startingTrigger)}`);
  console.log(`- Ending success state: ${compact(item?.endingSuccessState)}`);
  console.log(`- Production risk: ${compact(item?.problem)}`);
  console.log(`- Exact files likely to touch: ${compact(item?.allowedFiles)}`);
  console.log(`- Forbidden files: ${compact(item?.forbiddenFiles)}`);
  console.log(`- Runtime contracts that must survive: ${compact(item?.protectedContracts)}`);
  console.log(`- Adjacent behavior to verify: ${compact(item?.doneMeans ?? item?.protectedContracts)}`);
  console.log(`- Local proof commands: ${compact(item?.requiredLocalProof)}`);
  console.log(`- Production proof: ${compact(item?.requiredProductionProof)}`);
  console.log(`- Stop condition: ${compact(buildStopCondition(item, acceptanceGateText), 240)}`);
}

function runGitStatus(repoRoot: string): string {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'git status --short failed');
  }

  return result.stdout;
}

export function runControllerAutopilot(repoRoot = process.cwd()): number {
  const missingFiles = REQUIRED_FILES.filter(
    (file) => !existsSync(resolve(repoRoot, file)),
  );

  let backlogText = '';
  let acceptanceGateText = '';
  let sessionHistoryText = '';
  let dirtyStatusOutput = '';
  let hardStopReason: string | null = null;

  try {
    dirtyStatusOutput = runGitStatus(repoRoot);
  } catch (error) {
    hardStopReason = `git status --short failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (missingFiles.length > 0 && !hardStopReason) {
    hardStopReason = `Missing required file(s): ${missingFiles.join(', ')}`;
  }

  if (!hardStopReason) {
    backlogText = readRequiredFile(repoRoot, 'FOLDERA_PRODUCTION_BACKLOG.md');
    acceptanceGateText = readRequiredFile(repoRoot, 'ACCEPTANCE_GATE.md');
    sessionHistoryText = readRequiredFile(repoRoot, 'SESSION_HISTORY.md');
  }

  const dirtyEntries = parseGitStatusShort(dirtyStatusOutput);
  const dirtyClassification = classifyDirtyEntries(dirtyEntries);
  const backlogItems = backlogText ? parseBacklogItems(backlogText) : [];
  const waitingPassiveProofItems = findWaitingPassiveProofBacklogItems(backlogItems);
  const waitingExternalQuotaItems = findWaitingExternalQuotaBacklogItems(backlogItems);
  const firstOpenItem = findFirstOpenBacklogItem(backlogItems);
  const recentSessionEntries = sessionHistoryText
    ? parseSessionHistoryEntries(sessionHistoryText).slice(-3)
    : [];

  if (!hardStopReason && backlogItems.length === 0) {
    hardStopReason = 'Backlog parse failed: no BL-NNN sections found.';
  }

  if (!hardStopReason && !firstOpenItem) {
    hardStopReason =
      waitingPassiveProofItems.length > 0 || waitingExternalQuotaItems.length > 0
        ? 'No actionable OPEN backlog item found; all remaining backlog items are waiting or blocked.'
        : 'No actionable OPEN backlog item found.';
  }

  if (!hardStopReason && dirtyClassification.blocking.length > 0) {
    const blockingSummary = dirtyClassification.blocking
      .map((entry) => `${entry.path} (${entry.reason})`)
      .join('; ');
    hardStopReason = `Unsafe dirty files exist: ${blockingSummary}`;
  }

  const controllerResult = hardStopReason ? 'STOP' : 'GO';
  const requiredProofSummary = firstOpenItem
    ? `Local: ${compact(firstOpenItem.requiredLocalProof)} | Production: ${compact(firstOpenItem.requiredProductionProof)}`
    : 'UNKNOWN';

  console.log(`CONTROLLER RESULT: ${controllerResult}`);
  console.log(`Selected backlog ID: ${firstOpenItem?.id ?? 'UNKNOWN'}`);
  console.log(`Title: ${compact(firstOpenItem?.title)}`);
  console.log(`Rung: ${firstOpenItem?.rung ?? 'UNKNOWN'}`);
  console.log(`Protected path: ${compact(firstOpenItem?.userFacingPath)}`);
  console.log(`Required proof: ${requiredProofSummary}`);
  if (controllerResult === 'STOP') {
    console.log(`HARD STOP REASON: ${hardStopReason}`);
  }

  console.log('');
  printWaitingPassiveProofItems(waitingPassiveProofItems);
  printWaitingExternalBlockerItems(waitingExternalQuotaItems);

  console.log('');
  console.log('DIRTY FILE CLASSIFICATION');
  printDirtyGroup('SAFE GENERATED', dirtyClassification.safeGenerated);
  printDirtyGroup('CONTROLLER OWNED', dirtyClassification.controllerOwned);
  printDirtyGroup('BLOCKING', dirtyClassification.blocking);

  console.log('');
  printRecentSessionHistory(recentSessionEntries);

  console.log('');
  printSeamContractReport(firstOpenItem, acceptanceGateText);

  return controllerResult === 'GO' ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exit(runControllerAutopilot());
}
