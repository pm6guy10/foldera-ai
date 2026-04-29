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

export interface BacklogEligibility {
  item: BacklogItem;
  actionable: boolean;
  reason: string;
  actionableCondition: string;
}

export interface SessionHistoryEntry {
  heading: string;
  summaryLines: string[];
}

const WAITING_STATUS_RULES = new Map<string, { reason: string; actionableCondition: string }>([
  [
    'WAITING_EXTERNAL_ACCOUNT',
    {
      reason: 'requires unavailable external account setup',
      actionableCondition:
        'Provision and connect the required real account through the product before reopening.',
    },
  ],
  [
    'WAITING_EXTERNAL_PROOF',
    {
      reason: 'requires external proof before a code seam is actionable',
      actionableCondition:
        'Capture the required real proof or fresh failure evidence before reopening.',
    },
  ],
  [
    'WAITING_EXTERNAL_QUOTA',
    {
      reason: 'blocked by external paid/model quota',
      actionableCondition:
        'Wait for quota/access to return, then run the approved proof path before reopening.',
    },
  ],
  [
    'WAITING_PASSIVE_PROOF',
    {
      reason: 'requires passive next-window proof',
      actionableCondition:
        'Wait for the natural scheduled proof window and record the result before reopening.',
    },
  ],
  [
    'WAITING_PAID_PROOF',
    {
      reason: 'requires paid/model-backed proof',
      actionableCondition:
        'Get explicit approval and available model quota for the smallest paid proof before reopening.',
    },
  ],
  [
    'WAITING_MANUAL_AUTH',
    {
      reason: 'requires manual reauth',
      actionableCondition:
        'Complete the manual reauth flow with a real account before reopening.',
    },
  ],
  [
    'WAITING_REAL_USER',
    {
      reason: 'requires real user onboarding',
      actionableCondition:
        'Onboard a real user through the product path before reopening.',
    },
  ],
  [
    'WAITING_TIME_WINDOW',
    {
      reason: 'requires a future natural time window',
      actionableCondition:
        'Wait until the required time window occurs and record fresh proof before reopening.',
    },
  ],
]);

const BLOCKER_TEXT_RULES: Array<{
  pattern: RegExp;
  reason: string;
  actionableCondition: string;
}> = [
  {
    pattern:
      /\b(quota|usage limits?|api usage limit|anthropic quota|credit balance|quota reset)\b/i,
    reason: 'blocked by quota',
    actionableCondition:
      'Wait for quota/access to return, then run the approved proof path before reopening.',
  },
  {
    pattern:
      /\b(missing connected account|no connected non-owner|real connected non-owner|non-owner account|live auth and token rows|missing real account|connected provider tokens)\b/i,
    reason: 'blocked by missing connected account',
    actionableCondition:
      'Provision and connect the required real non-owner account before reopening.',
  },
  {
    pattern: /\b(missing non-owner proof|non-owner proof|non-owner depth)\b/i,
    reason: 'blocked by missing non-owner proof',
    actionableCondition:
      'Capture real non-owner production proof without owner-only or synthetic data before reopening.',
  },
  {
    pattern:
      /\b(passive proof|next normal|next-window|future natural|scheduled window|monitored production brief runs|wait for .*window)\b/i,
    reason: 'blocked by passive next-window proof',
    actionableCondition:
      'Wait for the natural production window and record the proof result before reopening.',
  },
  {
    pattern:
      /\b(paid[-\s]?proof|paid\/model(?:-backed)?|model-backed proof|paid generation|paid production proof|explicit paid[-\s]?proof approval|external model capacity|generate now proof)\b/i,
    reason: 'blocked by paid/model-backed proof',
    actionableCondition:
      'Get explicit approval and available model quota for the smallest paid proof before reopening.',
  },
  {
    pattern: /\b(manual reauth|reauth)\b/i,
    reason: 'blocked by manual reauth',
    actionableCondition:
      'Complete the real manual reauth flow before reopening.',
  },
  {
    pattern: /\b(real user onboarding|onboard a real user|requires real user)\b/i,
    reason: 'blocked by real user onboarding',
    actionableCondition:
      'Onboard a real user through the product before reopening.',
  },
  {
    pattern: /\b(time window|reset window|until .*\d{4}|future .*cron window)\b/i,
    reason: 'blocked by future time window',
    actionableCondition:
      'Wait until the required time window arrives and record fresh proof before reopening.',
  },
  {
    pattern:
      /\b(no current failing seam|no current failure|no failing seam|health (?:is )?passing|health gate (?:is )?passing|no .*failure reproduces|does not reproduce locally)\b/i,
    reason: 'no current failing seam to repair',
    actionableCondition:
      'Record fresh failing health/preflight/runtime evidence before selecting this item for code work.',
  },
];

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

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function getEligibilitySearchText(item: BacklogItem): string {
  return [item.status, item.nextBlocker]
    .filter(Boolean)
    .join(' ');
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

export function getBacklogEligibility(item: BacklogItem): BacklogEligibility {
  const status = normalizeStatus(item.status);

  if (status !== 'OPEN') {
    const waitingRule = WAITING_STATUS_RULES.get(status);
    if (waitingRule) {
      return {
        item,
        actionable: false,
        reason: waitingRule.reason,
        actionableCondition: waitingRule.actionableCondition,
      };
    }

    if (!status) {
      return {
        item,
        actionable: false,
        reason: 'missing backlog status',
        actionableCondition: 'Set Status: OPEN only when the item has a current actionable seam.',
      };
    }

    return {
      item,
      actionable: false,
      reason: `status is ${status}`,
      actionableCondition:
        'Reopen with Status: OPEN only after fresh evidence shows a current actionable seam.',
    };
  }

  const searchText = getEligibilitySearchText(item);
  const blockerRule = BLOCKER_TEXT_RULES.find((rule) => rule.pattern.test(searchText));
  if (blockerRule) {
    return {
      item,
      actionable: false,
      reason: blockerRule.reason,
      actionableCondition: blockerRule.actionableCondition,
    };
  }

  return {
    item,
    actionable: true,
    reason: 'Status is OPEN and no external/proof-only blocker is recorded',
    actionableCondition: 'Code, test, or proof work can be performed now in this repo/runtime.',
  };
}

export function findFirstActionableBacklogItem(
  items: readonly BacklogItem[],
): BacklogItem | null {
  return items.find((item) => getBacklogEligibility(item).actionable) ?? null;
}

export function findNonActionableBacklogItems(
  items: readonly BacklogItem[],
): BacklogEligibility[] {
  return items.map(getBacklogEligibility).filter((eligibility) => !eligibility.actionable);
}

export function findWaitingPassiveProofBacklogItems(
  items: readonly BacklogItem[],
): BacklogItem[] {
  return items.filter(
    (item) => normalizeStatus(item.status) === 'WAITING_PASSIVE_PROOF',
  );
}

export function findWaitingExternalQuotaBacklogItems(
  items: readonly BacklogItem[],
): BacklogItem[] {
  return findWaitingExternalBlockerBacklogItems(items).filter(
    (item) => normalizeStatus(item.status) === 'WAITING_EXTERNAL_QUOTA',
  );
}

export function findWaitingExternalBlockerBacklogItems(
  items: readonly BacklogItem[],
): BacklogItem[] {
  const externalWaitingStatuses = new Set([
    'WAITING_EXTERNAL_ACCOUNT',
    'WAITING_EXTERNAL_PROOF',
    'WAITING_EXTERNAL_QUOTA',
    'WAITING_PAID_PROOF',
    'WAITING_MANUAL_AUTH',
    'WAITING_REAL_USER',
    'WAITING_TIME_WINDOW',
  ]);

  return items.filter(
    (item) => externalWaitingStatuses.has(normalizeStatus(item.status)),
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

function printSkippedNonActionableItems(items: readonly BacklogEligibility[]) {
  console.log('SKIPPED NON-ACTIONABLE ITEMS:');
  if (items.length === 0) {
    console.log('- none');
    return;
  }

  for (const eligibility of items) {
    console.log(
      `- ${eligibility.item.id} | status=${eligibility.item.status ?? 'UNKNOWN'} | reason=${eligibility.reason} | actionable when: ${eligibility.actionableCondition}`,
    );
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
  const backlogEligibility = backlogItems.map(getBacklogEligibility);
  const waitingPassiveProofItems = findWaitingPassiveProofBacklogItems(backlogItems);
  const waitingExternalBlockerItems = findWaitingExternalBlockerBacklogItems(backlogItems);
  const firstActionableIndex = backlogEligibility.findIndex(
    (eligibility) => eligibility.actionable,
  );
  const firstActionableItem =
    firstActionableIndex >= 0 ? backlogEligibility[firstActionableIndex]?.item ?? null : null;
  const skippedItems =
    firstActionableIndex >= 0
      ? backlogEligibility.slice(0, firstActionableIndex)
      : backlogEligibility.filter((eligibility) => !eligibility.actionable);
  const recentSessionEntries = sessionHistoryText
    ? parseSessionHistoryEntries(sessionHistoryText).slice(-3)
    : [];

  if (!hardStopReason && backlogItems.length === 0) {
    hardStopReason = 'Backlog parse failed: no BL-NNN sections found.';
  }

  if (!hardStopReason && !firstActionableItem) {
    hardStopReason =
      skippedItems.length > 0
        ? 'No actionable backlog item found; all parsed items are waiting, blocked, closed, missing status, or missing a current code/proof seam.'
        : 'No actionable backlog item found.';
  }

  if (!hardStopReason && dirtyClassification.blocking.length > 0) {
    const blockingSummary = dirtyClassification.blocking
      .map((entry) => `${entry.path} (${entry.reason})`)
      .join('; ');
    hardStopReason = `Unsafe dirty files exist: ${blockingSummary}`;
  }

  const controllerResult = hardStopReason ? 'STOP' : 'GO';
  const requiredProofSummary = firstActionableItem
    ? `Local: ${compact(firstActionableItem.requiredLocalProof)} | Production: ${compact(firstActionableItem.requiredProductionProof)}`
    : 'UNKNOWN';

  console.log(`CONTROLLER RESULT: ${controllerResult}`);
  console.log(`Selected backlog ID: ${firstActionableItem?.id ?? 'UNKNOWN'}`);
  console.log(`Title: ${compact(firstActionableItem?.title)}`);
  console.log(`Rung: ${firstActionableItem?.rung ?? 'UNKNOWN'}`);
  console.log(`Protected path: ${compact(firstActionableItem?.userFacingPath)}`);
  console.log(`Required proof: ${requiredProofSummary}`);
  if (controllerResult === 'STOP') {
    console.log(`HARD STOP REASON: ${hardStopReason}`);
  }

  console.log('');
  printSkippedNonActionableItems(skippedItems);
  console.log('');
  printWaitingPassiveProofItems(waitingPassiveProofItems);
  printWaitingExternalBlockerItems(waitingExternalBlockerItems);

  console.log('');
  console.log('DIRTY FILE CLASSIFICATION');
  printDirtyGroup('SAFE GENERATED', dirtyClassification.safeGenerated);
  printDirtyGroup('CONTROLLER OWNED', dirtyClassification.controllerOwned);
  printDirtyGroup('BLOCKING', dirtyClassification.blocking);

  console.log('');
  printRecentSessionHistory(recentSessionEntries);

  console.log('');
  printSeamContractReport(firstActionableItem, acceptanceGateText);

  return controllerResult === 'GO' ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exit(runControllerAutopilot());
}
