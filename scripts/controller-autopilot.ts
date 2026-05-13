import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FolderaRunContract,
  normalizeContractFilePatterns,
} from './preflight-contract';

const REQUIRED_FILES = [
  'FOLDERA_PRODUCTION_BACKLOG.md',
  'ACTIVE_HANDOFF.md',
  'CURRENT_STATE.md',
  'ACCEPTANCE_GATE.md',
  'SESSION_HISTORY.md',
] as const;

const CONTROLLER_OWNED_PATHS = new Set([
  'package.json',
  'scripts/controller-autopilot.ts',
  'scripts/preflight-contract.ts',
  'scripts/__tests__/controller-autopilot.test.ts',
  'scripts/__tests__/preflight-contract.test.ts',
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
  generatedContractId?: string | null;
  rung: string | null;
  moneyLoopRung: string | null;
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
  isUserFacing: boolean | null;
  browserProofCommand: string | null;
  doneMeans: string | null;
  doNotCount: string | null;
  status: string | null;
  nextBlocker: string | null;
  sourceTruthFile: string | null;
  sourceTruthFinding: string | null;
  requiredClosureUpdate: string | null;
}

interface ControllerTruthSnapshot {
  activeHandoffText: string;
  currentStateText: string;
  sessionHistoryText: string;
  healthOutput: string;
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

function hasUnpaidDeterministicReplayAllowance(item: BacklogItem): boolean {
  const status = normalizeStatus(item.status);
  if (status !== 'WAITING_PAID_PROOF') return false;

  const backlogText = [
    item.startingTrigger,
    item.requiredLocalProof,
    item.requiredProductionProof,
    item.doneMeans,
    item.nextBlocker,
  ]
    .filter(Boolean)
    .join(' ');

  const explicitlyAllowsDeterministicReplay =
    /\bdeterministic local fixture replay\b/i.test(backlogText) ||
    /\bunpaid deterministic local\b/i.test(backlogText);
  const nextActionIsUnpaidLocalReplay =
    /\bunpaid\b[^.]*\b(local|fixture|replay)\b/i.test(item.nextBlocker ?? '') &&
    /\b(owner-shaped|money-shot|fixture|replay)\b/i.test(item.nextBlocker ?? '');
  const paidProductionProofStillPending =
    /\b(paid|live|production)\b[^.]*\b(proof|generate now)\b/i.test(backlogText) &&
    /\b(pending|required|remains|later|after)\b/i.test(backlogText);

  return (
    explicitlyAllowsDeterministicReplay &&
    nextActionIsUnpaidLocalReplay &&
    paidProductionProofStillPending
  );
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

function parseBooleanField(value: string | null | undefined): boolean | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'true' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === 'no') return false;
  return null;
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
      generatedContractId: null,
      rung: extractField(block, 'Rung'),
      moneyLoopRung: extractField(block, 'Money loop rung'),
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
      isUserFacing: parseBooleanField(extractField(block, 'Is user-facing')),
      browserProofCommand: extractField(block, 'Browser proof command'),
      doneMeans: extractField(block, 'Done means'),
      doNotCount: extractField(block, 'Do-not-count'),
      status: extractField(block, 'Status'),
      nextBlocker: extractField(block, 'Next blocker'),
      sourceTruthFile: extractField(block, 'Source truth file'),
      sourceTruthFinding: extractField(block, 'Source truth finding'),
      requiredClosureUpdate: extractField(block, 'Required closure update'),
    };
  });
}

export function findFirstOpenBacklogItem(items: readonly BacklogItem[]): BacklogItem | null {
  return items.find((item) => item.status?.trim().toUpperCase() === 'OPEN') ?? null;
}

export function getBacklogEligibility(item: BacklogItem): BacklogEligibility {
  const status = normalizeStatus(item.status);

  if (hasUnpaidDeterministicReplayAllowance(item)) {
    return {
      item,
      actionable: true,
      reason:
        'paid production proof remains pending, but unpaid deterministic local fixture replay is explicitly allowed',
      actionableCondition:
        'Run only the unpaid deterministic local replay seam; keep paid production proof pending until local money-shot proof passes.',
    };
  }

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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function containsNormalizedText(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizeWhitespace(haystack).toLowerCase();
  const normalizedNeedle = normalizeWhitespace(needle).toLowerCase();
  return normalizedNeedle.length > 0 && normalizedHaystack.includes(normalizedNeedle);
}

function findMatchingLine(
  text: string,
  predicate: (line: string) => boolean,
): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (predicate(line)) {
      return line;
    }
  }

  return null;
}

function extractSection(markdown: string, heading: string): string {
  const escaped = escapeRegex(heading);
  const match = markdown.match(
    new RegExp(`^##\\s+${escaped}\\s*$\\r?\\n([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm'),
  );
  return match?.[1]?.trim() ?? '';
}

function readHealthOutput(repoRoot: string, activeHandoffText: string): string {
  const packageJsonPath = resolve(repoRoot, 'package.json');
  const healthScriptPath = resolve(repoRoot, 'scripts', 'health.ts');

  if (existsSync(packageJsonPath) && existsSync(healthScriptPath)) {
    const result = spawnSync('npm', ['run', 'health'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120000,
    });

    if (!result.error && result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  const handoffHealthMatch = activeHandoffText.match(/health:[^\r\n]+/i);
  return handoffHealthMatch?.[0]?.trim() ?? 'Health output unavailable.';
}

export function buildTruthSnapshot(
  activeHandoffText: string,
  currentStateText: string,
  sessionHistoryText: string,
  healthOutput: string,
): ControllerTruthSnapshot {
  return {
    activeHandoffText,
    currentStateText,
    sessionHistoryText,
    healthOutput,
  };
}

function buildGeneratedContractId(slug: string): string {
  return `GENERATED-${slug}`;
}

function ensureContractListIncludes(raw: string, path: string): string {
  const normalized = normalizeRepoPath(path);
  if (normalizeContractFilePatterns(raw).includes(normalized)) {
    return raw;
  }

  return raw.trim() ? `${raw.trim()}, \`${normalized}\`` : `\`${normalized}\``;
}

function createGeneratedContract(
  slug: string,
  fields: Partial<BacklogItem> & {
    moneyLoopRung: string;
    title: string;
    userFacingPath: string;
    startingTrigger: string;
    endingSuccessState: string;
    problem: string;
    allowedFiles: string;
    forbiddenFiles: string;
    requiredLocalProof: string;
    requiredProductionProof: string;
    doneMeans: string;
    nextBlocker: string;
    sourceTruthFile: string;
    sourceTruthFinding: string;
    requiredClosureUpdate: string;
  },
): BacklogItem {
  const generatedId = buildGeneratedContractId(slug);
  const allowedFiles = ensureContractListIncludes(
    fields.allowedFiles,
    fields.sourceTruthFile,
  );

  return {
    headingId: generatedId,
    id: generatedId,
    generatedContractId: generatedId,
    rung: fields.rung ?? 'GENERATED',
    moneyLoopRung: fields.moneyLoopRung,
    title: fields.title,
    userFacingPath: fields.userFacingPath,
    startingTrigger: fields.startingTrigger,
    endingSuccessState: fields.endingSuccessState,
    problem: fields.problem,
    protectedContracts: fields.protectedContracts ?? null,
    allowedFiles,
    forbiddenFiles: fields.forbiddenFiles,
    requiredLocalProof: fields.requiredLocalProof,
    requiredProductionProof: fields.requiredProductionProof,
    isUserFacing: fields.isUserFacing ?? false,
    browserProofCommand: fields.browserProofCommand ?? null,
    doneMeans: fields.doneMeans,
    doNotCount: fields.doNotCount ?? 'Backlog emptiness alone is not a valid stop state.',
    status: 'GENERATED',
    nextBlocker: fields.nextBlocker,
    sourceTruthFile: fields.sourceTruthFile,
    sourceTruthFinding: fields.sourceTruthFinding,
    requiredClosureUpdate: fields.requiredClosureUpdate,
  };
}

function extractLiveConnectorFreshnessFinding(
  snapshot: ControllerTruthSnapshot,
): string | null {
  return findMatchingLine(snapshot.healthOutput, (line) => {
    if (!/\b(gmail|outlook|google|microsoft|mail cursors)\b/i.test(line)) {
      return false;
    }

    if (/\bfresh\b/i.test(line)) {
      return false;
    }

    return /\b(stale|disconnected|reauth_required|never_synced|needs_reauth|needs_sync|sync_stale|refresh|reconnect)\b/i.test(
      line,
    );
  });
}

function extractCurrentStateFinding(
  currentStateText: string,
  pattern: RegExp,
): string | null {
  return findMatchingLine(currentStateText, (line) => pattern.test(line));
}

function getSourceTruthText(
  sourceTruthFile: string | null | undefined,
  snapshot: ControllerTruthSnapshot,
): string {
  switch (sourceTruthFile) {
    case 'ACTIVE_HANDOFF.md':
      return snapshot.activeHandoffText;
    case 'CURRENT_STATE.md':
      return snapshot.currentStateText;
    case 'SESSION_HISTORY.md':
      return snapshot.sessionHistoryText;
    default:
      return '';
  }
}

export function generatedContractHasLiveFinding(
  item: BacklogItem,
  snapshot: ControllerTruthSnapshot,
): boolean {
  if (!item.generatedContractId) {
    return true;
  }

  const finding = item.sourceTruthFinding?.trim();
  if (!finding) {
    return false;
  }

  const sourceTruthText = getSourceTruthText(item.sourceTruthFile, snapshot);
  return (
    containsNormalizedText(sourceTruthText, finding) ||
    containsNormalizedText(snapshot.healthOutput, finding)
  );
}

export function synthesizeAppOwnerContract(
  snapshot: ControllerTruthSnapshot,
): BacklogItem | null {
  const connectorFreshnessFinding = extractLiveConnectorFreshnessFinding(snapshot);
  if (connectorFreshnessFinding) {
    return createGeneratedContract('SOURCE-FRESHNESS-CONNECTOR-HEALTH', {
      moneyLoopRung: 'source_freshness',
      title: 'Connector freshness truth must stay visible before generation',
      userFacingPath:
        'Health + settings + run-brief guard must agree on fresh/stale/disconnected/reauth connector truth before generation.',
      startingTrigger:
        'Health output or settings truth shows a stale/disconnected/reauth source while generation can still proceed unclearly.',
      endingSuccessState:
        'Health, settings, and run-brief guard classify the same connector state and generation warns or blocks safely when required sources are stale.',
      problem:
        'Foldera still has unresolved connector freshness or reconnect truth, so the main loop can look runnable when sources are not actually ready.',
      protectedContracts:
        'Do not touch artifact generation, billing, dashboard shell layout, Stripe, or outbound email behavior. Keep the connector state contract narrow and truthful.',
      allowedFiles:
        '`lib/integrations/connector-health.ts`, `app/api/integrations/status/route.ts`, `app/api/settings/run-brief/route.ts`, `app/dashboard/settings/SettingsClient.tsx`, `scripts/health.ts`, `scripts/health-connectors.ts`, `lib/integrations/__tests__/connector-health.test.ts`, `app/api/integrations/status/__tests__/route.test.ts`, `app/api/settings/run-brief/__tests__/route.test.ts`, `scripts/__tests__/health-connectors.test.ts`, `tests/e2e/authenticated-routes.spec.ts`, `ACTIVE_HANDOFF.md`, `SESSION_HISTORY.md`',
      forbiddenFiles:
        '`lib/briefing/**`, `lib/cron/**`, `app/dashboard/page.tsx`, `supabase/migrations/**`, `app/api/stripe/**`, outbound email paths, paid generation routes beyond the stale-guard check`',
      requiredLocalProof:
        'node node_modules/vitest/vitest.mjs run lib/integrations/__tests__/connector-health.test.ts app/api/integrations/status/__tests__/route.test.ts app/api/settings/run-brief/__tests__/route.test.ts scripts/__tests__/health-connectors.test.ts --reporter=verbose; npm run health; npm run build',
      requiredProductionProof:
        'npx playwright test tests/e2e/authenticated-routes.spec.ts --grep "shows stale Google clearly while Microsoft stays fresh" --reporter=list',
      isUserFacing: true,
      browserProofCommand:
        'npx playwright test tests/e2e/authenticated-routes.spec.ts --grep "shows stale Google clearly while Microsoft stays fresh" --reporter=list',
      doneMeans:
        'Connector freshness is explicit and consistent before generation: Foldera says which source is stale/disconnected/reauth_required, preserves the healthy source truth, and generation warns or blocks safely instead of pretending the loop is ready.',
      nextBlocker:
        'Prove the stale/disconnected connector truth on the real settings + run-brief path without widening into generation or sync internals.',
      sourceTruthFile: 'ACTIVE_HANDOFF.md',
      sourceTruthFinding: connectorFreshnessFinding,
      requiredClosureUpdate:
        'Update ACTIVE_HANDOFF.md so the current command state records the repaired connector freshness truth or the exact remaining external blocker.',
    });
  }

  const convergenceFinding = extractCurrentStateFinding(
    snapshot.currentStateText,
    /Convergence depends on name overlap/i,
  );
  if (convergenceFinding) {
    return createGeneratedContract('CANDIDATE-SELECTION-CONVERGENCE', {
      moneyLoopRung: 'candidate_selection',
      title: 'Calendar-title-only convergence must still surface the right candidate',
      userFacingPath:
        'Signal scoring should still recognize one entity across calendar titles and neighboring signals even when the exact name string is missing from message bodies.',
      startingTrigger:
        'Current truth says extractConvergence under-matches when calendar titles omit the exact entity name.',
      endingSuccessState:
        'Calendar-title-only convergence contributes to candidate selection, so the same entity can surface from mixed-source evidence without exact body-text name repetition.',
      problem:
        'Candidate selection can miss a real convergence signal because extractConvergence currently depends on exact entity-name overlap in signal bodies.',
      protectedContracts:
        'Do not change paid generation, dashboard actions, outbound email, cron delivery, Stripe, or schema state. Keep the seam inside deterministic convergence extraction/scoring and its proofs.',
      allowedFiles:
        '`lib/briefing/discrepancy-detector.ts`, `lib/briefing/scorer.ts`, `lib/briefing/__tests__/discrepancy-detector.test.ts`, `ACTIVE_HANDOFF.md`, `SESSION_HISTORY.md`',
      forbiddenFiles:
        '`app/dashboard/**`, `app/api/settings/run-brief/**`, `lib/cron/**`, `supabase/migrations/**`, `app/api/stripe/**`, paid proof routes, unrelated homepage/settings files`',
      requiredLocalProof:
        'node node_modules/vitest/vitest.mjs run lib/briefing/__tests__/discrepancy-detector.test.ts --reporter=verbose; npm run health; npm run build',
      requiredProductionProof:
        'npm run winner:autopsy',
      isUserFacing: false,
      browserProofCommand: null,
      doneMeans:
        'A calendar-title-only convergence scenario now advances candidate_selection: deterministic proof shows the same entity can be linked across sources without exact body-text name overlap, and the resulting candidate evidence stays grounded.',
      nextBlocker:
        'Use deterministic convergence proof first; only widen if the same under-match still survives scorer truth after the extractor fix.',
      doNotCount:
        'Do not call this done from backlog emptiness, logs alone, or a code diff without convergence-focused regression proof.',
      sourceTruthFile: 'CURRENT_STATE.md',
      sourceTruthFinding: convergenceFinding,
      requiredClosureUpdate:
        'Update CURRENT_STATE.md to retire the name-overlap-only finding once known entity email aliases are proven to count, while preserving any broader unresolved convergence risk that still has evidence.',
    });
  }

  const selectedMovePersistenceFinding =
    extractCurrentStateFinding(
      snapshot.currentStateText,
      /Selected WorkSourceWA move is not yet persisted as an artifact\/action/i,
    ) ??
    extractCurrentStateFinding(
      snapshot.currentStateText,
      /Selected WorkSourceWA persistence still needs hosted proof after deployment/i,
    ) ??
    extractCurrentStateFinding(
      snapshot.currentStateText,
      /Selected WorkSourceWA persistence still needs no-paid execution proof/i,
    ) ??
    extractCurrentStateFinding(
      snapshot.currentStateText,
      /Selected WorkSourceWA latest visibility handles no-paid selected moves/i,
    );
  if (selectedMovePersistenceFinding) {
    return createGeneratedContract('SELECTED-MOVE-TO-PERSISTED-ARTIFACT', {
      moneyLoopRung: 'persisted_action_history',
      title: 'Selected current move must become a persisted artifact/action record',
      userFacingPath:
        'A no-paid selected Tier 1 current move should either become a persisted useful artifact/action/history record or stop at the exact model-backed generation requirement.',
      startingTrigger:
        'Current truth says winner/autopsy selects a Tier 1 WorkSourceWA admin-deadline current move, but that move is not yet persisted as an artifact/action/history row.',
      endingSuccessState:
        'Deterministic proof shows the selected move can persist and be read back through latest/history APIs, or names the exact first code or external blocker before persistence.',
      problem:
        'Foldera can now select a safe current move, but the next money-loop rung is unproven: selected move -> persisted action/history artifact.',
      protectedContracts:
        'Do not touch frontend, do not use proof:golden-artifact, do not run paid/model generation, do not send outbound email, do not change Stripe, schema, or destructive DB behavior.',
      allowedFiles:
        '`lib/conviction/artifact-generator.ts`, `lib/conviction/artifact-generator-compat.ts`, `lib/conviction/action-read-shapes.ts`, `lib/conviction/__tests__/artifact-generator.test.ts`, `lib/conviction/__tests__/artifact-generator-contract.test.ts`, `app/api/conviction/generate/route.ts`, `app/api/conviction/latest/route.ts`, `app/api/conviction/history/route.ts`, `app/api/conviction/latest/__tests__/*`, `app/api/conviction/history/__tests__/*`, `app/api/conviction/daily-value/__tests__/route.test.ts`, `ACTIVE_HANDOFF.md`, `CURRENT_STATE.md`, `SESSION_HISTORY.md`',
      forbiddenFiles:
        '`app/dashboard/**`, `components/**`, `lib/briefing/generator.ts`, `lib/cron/**`, `supabase/migrations/**`, `app/api/stripe/**`, outbound email paths, paid generation proof paths, `scripts/proof-golden-artifact*`',
      requiredLocalProof:
        'node node_modules/vitest/vitest.mjs run lib/conviction/__tests__/artifact-generator.test.ts lib/conviction/__tests__/artifact-generator-contract.test.ts app/api/conviction/latest/__tests__/free-artifact-allowance.test.ts app/api/conviction/history/__tests__/route.test.ts app/api/conviction/daily-value/__tests__/route.test.ts --reporter=verbose; npm run winner:autopsy; npm run health; npm run build',
      requiredProductionProof:
        'No paid production proof by default. Use no-paid API/replay proof only; stop before any paid/model-backed generation, outbound email, schema action, or destructive DB action.',
      isUserFacing: false,
      browserProofCommand: null,
      doneMeans:
        'The selected WorkSourceWA move either has a deterministic persisted artifact/action/history proof through latest/history APIs, or the exact first external/model-backed blocker is named without fake data.',
      nextBlocker:
        'Prove selected move -> persisted action/history without frontend, golden artifact proof, paid generation, outbound email, Stripe, or schema/destructive DB actions.',
      doNotCount:
        'Do not count winner selection alone, daily-value alone, fake golden artifacts, frontend proof, or paid/model generation without explicit approval.',
      sourceTruthFile: 'CURRENT_STATE.md',
      sourceTruthFinding: selectedMovePersistenceFinding,
      requiredClosureUpdate:
        'Update CURRENT_STATE.md, ACTIVE_HANDOFF.md, and SESSION_HISTORY.md with persisted output proof or the exact selected-move persistence blocker.',
    });
  }

  const usefulCurrentMoveFinding = extractCurrentStateFinding(
    snapshot.currentStateText,
    /latest persisted generation is still historical `do_nothing`/i,
  );
  if (
    usefulCurrentMoveFinding &&
    /\b(daily-value|daily utility slate|current best move)\b/i.test(
      `${snapshot.currentStateText}\n${snapshot.sessionHistoryText}`,
    )
  ) {
    return createGeneratedContract('USEFUL-CURRENT-MOVE-DAILY-VALUE', {
      moneyLoopRung: 'artifact_or_useful_current_move',
      title: 'Current best move must stay truthful and useful when no fresh artifact persists',
      userFacingPath:
        'When /api/conviction/latest has no visible pending artifact, /dashboard should still show the deterministic current best move without contradicting the approval/save path.',
      startingTrigger:
        'Current truth says the latest persisted generation is still historical do_nothing while daily-value is carrying the user-facing useful read.',
      endingSuccessState:
        'The dashboard and deterministic daily-value path present one current useful move with grounded source trail and non-contradictory actions until a fresh safe artifact persists.',
      problem:
        'Foldera still relies on a useful-current-move fallback because the latest persisted generation is historical do_nothing, so this path remains a real production-readiness rung.',
      protectedContracts:
        'Do not trigger paid generation, do not send outbound email, do not rewrite latest/persistence semantics into fake pending artifacts, and do not widen into billing or connector auth.',
      allowedFiles:
        '`app/api/conviction/daily-value/route.ts`, `app/dashboard/page.tsx`, `app/dashboard/dashboard-page-model.tsx`, `lib/briefing/daily-utility-slate.ts`, `app/api/conviction/daily-value/__tests__/route.test.ts`, `lib/briefing/__tests__/daily-utility-slate.test.ts`, `tests/config/__tests__/dashboard-inbox-model.test.ts`, `tests/e2e/dashboard-navigation.spec.ts`, `tests/e2e/authenticated-routes.spec.ts`, `ACTIVE_HANDOFF.md`, `SESSION_HISTORY.md`',
      forbiddenFiles:
        '`app/api/settings/run-brief/**`, `lib/cron/**`, `lib/briefing/generator.ts`, `supabase/migrations/**`, `app/api/stripe/**`, paid model proof paths, unrelated public homepage files`',
      requiredLocalProof:
        'node node_modules/vitest/vitest.mjs run app/api/conviction/daily-value/__tests__/route.test.ts lib/briefing/__tests__/daily-utility-slate.test.ts tests/config/__tests__/dashboard-inbox-model.test.ts --reporter=verbose; npm run health; npm run build',
      requiredProductionProof:
        'node node_modules/@playwright/test/cli.js test tests/e2e/dashboard-navigation.spec.ts --grep "current best move" --reporter=list',
      isUserFacing: true,
      browserProofCommand:
        'node node_modules/@playwright/test/cli.js test tests/e2e/dashboard-navigation.spec.ts --grep "current best move" --reporter=list',
      doneMeans:
        'When no fresh pending artifact exists, Foldera still shows one grounded useful current move with source trail and non-contradictory save/copy behavior, without pretending a finished artifact was persisted.',
      nextBlocker:
        'Keep this seam inside the deterministic current-best-move path until it is proven truthful at the dashboard surface.',
      sourceTruthFile: 'CURRENT_STATE.md',
      sourceTruthFinding: usefulCurrentMoveFinding,
      requiredClosureUpdate:
        'Update CURRENT_STATE.md when the deterministic current-best-move fallback is proven truthful or replaced by a fresher persisted artifact path, and append only a new SESSION_HISTORY receipt.',
    });
  }

  return null;
}

function getExternalBlockerStopReason(
  snapshot: ControllerTruthSnapshot,
  waitingExternalBlockerItems: readonly BacklogItem[],
): string | null {
  const blockerText = [
    snapshot.currentStateText,
    snapshot.activeHandoffText,
    ...waitingExternalBlockerItems.map((item) => `${item.status ?? ''} ${item.nextBlocker ?? ''}`),
  ].join('\n');

  if (/\b(paid[-\s]?proof|paid model|paid\/model-backed proof|quota returns|explicitly approved paid|WAITING_PAID_PROOF|WAITING_EXTERNAL_QUOTA)\b/i.test(blockerText)) {
    return 'All remaining money-loop rungs are externally blocked by paid/model-backed proof.';
  }

  if (/\b(real connected non-owner|real non-owner account|connected non-owner|WAITING_EXTERNAL_ACCOUNT|credentials required|missing credential)\b/i.test(blockerText)) {
    return 'All remaining money-loop rungs are externally blocked by external account setup or credentials.';
  }

  if (/\b(product decision|safety decision|policy decision)\b/i.test(blockerText)) {
    return 'All remaining money-loop rungs are externally blocked by a product or safety decision.';
  }

  return null;
}

function isWholeLoopExplicitlyProven(snapshot: ControllerTruthSnapshot): boolean {
  const brokenSection = extractSection(snapshot.currentStateText, 'B. WHAT IS BROKEN (REAL)');
  if (brokenSection && /\*\*/.test(brokenSection)) return false;
  return /\bRESULT:\s*0 FAILING\b/i.test(snapshot.healthOutput);
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
  console.log(`- Generated contract ID: ${item?.generatedContractId ?? 'none'}`);
  console.log(`- Title: ${compact(item?.title)}`);
  console.log(`- Rung: ${item?.rung ?? 'UNKNOWN'}`);
  console.log(`- Money loop rung: ${item?.moneyLoopRung ?? 'UNKNOWN'}`);
  console.log(`- User/system path protected: ${compact(item?.userFacingPath)}`);
  console.log(`- Starting trigger/route: ${compact(item?.startingTrigger)}`);
  console.log(`- Acceptance condition: ${compact(item?.doneMeans)}`);
  console.log(`- Ending success state: ${compact(item?.endingSuccessState)}`);
  console.log(`- Production risk: ${compact(item?.problem)}`);
  console.log(`- Exact files likely to touch: ${compact(item?.allowedFiles)}`);
  console.log(`- Forbidden files: ${compact(item?.forbiddenFiles)}`);
  console.log(`- Runtime contracts that must survive: ${compact(item?.protectedContracts)}`);
  console.log(`- Adjacent behavior to verify: ${compact(item?.doneMeans ?? item?.protectedContracts)}`);
  console.log(`- Local proof commands: ${compact(item?.requiredLocalProof)}`);
  console.log(`- Production proof: ${compact(item?.requiredProductionProof)}`);
  console.log(`- User-facing seam: ${item?.isUserFacing == null ? 'UNKNOWN' : item.isUserFacing ? 'true' : 'false'}`);
  console.log(`- Browser proof command: ${compact(item?.browserProofCommand)}`);
  console.log(`- Closure source truth: ${compact(item?.sourceTruthFile)}`);
  console.log(`- Source truth finding: ${compact(item?.sourceTruthFinding)}`);
  console.log(`- Required closure update: ${compact(item?.requiredClosureUpdate)}`);
  console.log(`- Stop condition: ${compact(buildStopCondition(item, acceptanceGateText), 240)}`);
}

function normalizeContractNotes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .map((s) => s.replace(/^[-*]\s+/, '').trim())
    .map((s) => s.replace(/^`+|`+$/g, '').trim())
    .filter(Boolean);
}

function getGitHeadSha(repoRoot: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'git rev-parse HEAD failed');
  return (result.stdout || '').trim();
}

function buildNextCommand(item: BacklogItem | null, acceptanceGateText: string): string {
  const id = item?.id ?? 'UNKNOWN';
  const allowed = normalizeContractFilePatterns(item?.allowedFiles);
  const forbidden = normalizeContractFilePatterns(item?.forbiddenFiles);
  const localProof = compact(item?.requiredLocalProof);
  const prodProof = compact(item?.requiredProductionProof);
  const stop = compact(buildStopCondition(item, acceptanceGateText), 240);

  return [
    'Run FOLDERA CONTROLLED AUTOPILOT.',
    `Selected: ${id}.`,
    `Allowed: ${allowed.length ? allowed.join(' | ') : '(unspecified)'}.`,
    `Forbidden: ${forbidden.length ? forbidden.join(' | ') : '(unspecified)'}.`,
    `Proof: local="${localProof}" production="${prodProof}".`,
    `Stop when: ${stop}`,
  ].join(' ');
}

function writeContractFile(repoRoot: string, item: BacklogItem | null, acceptanceGateText: string) {
  const head = getGitHeadSha(repoRoot);
  const stopCondition = buildStopCondition(item, acceptanceGateText);
  const contract: FolderaRunContract = {
    backlog_id: item?.id ?? 'UNKNOWN',
    generated_contract_id: item?.generatedContractId ?? undefined,
    base_commit: head,
    money_loop_rung: item?.moneyLoopRung?.trim() ?? '',
    user_system_path: item?.userFacingPath ?? '',
    allowed_file_patterns: normalizeContractFilePatterns(item?.allowedFiles),
    forbidden_file_patterns: normalizeContractFilePatterns(item?.forbiddenFiles),
    allowed_files_raw: item?.allowedFiles ?? '',
    forbidden_files_raw: item?.forbiddenFiles ?? '',
    required_local_proof: item?.requiredLocalProof ?? '',
    required_product_proof: item?.requiredProductionProof ?? '',
    required_browser_proof: item?.requiredProductionProof ?? '',
    acceptance_condition: item?.doneMeans ?? '',
    stop_condition: stopCondition,
    source_truth_file: item?.sourceTruthFile ?? undefined,
    source_truth_finding: item?.sourceTruthFinding ?? undefined,
    required_closure_update: item?.requiredClosureUpdate ?? undefined,
    is_user_facing: item?.isUserFacing ?? false,
    browser_proof_command: item?.browserProofCommand ?? '',
    anti_regression_checks: normalizeContractNotes(
      item?.doneMeans ?? item?.protectedContracts,
    ),
    next_command: buildNextCommand(item, acceptanceGateText),
  };

  const path = resolve(repoRoot, '.foldera-contract.json');
  writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
}

function clearContractFile(repoRoot: string) {
  const path = resolve(repoRoot, '.foldera-contract.json');
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

function printNextCommand(item: BacklogItem | null, acceptanceGateText: string) {
  console.log('');
  console.log('NEXT COMMAND (verbatim — paste this as-is)');
  console.log(buildNextCommand(item, acceptanceGateText));
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
  let activeHandoffText = '';
  let currentStateText = '';
  let acceptanceGateText = '';
  let sessionHistoryText = '';
  let healthOutput = '';
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
    activeHandoffText = readRequiredFile(repoRoot, 'ACTIVE_HANDOFF.md');
    currentStateText = readRequiredFile(repoRoot, 'CURRENT_STATE.md');
    acceptanceGateText = readRequiredFile(repoRoot, 'ACCEPTANCE_GATE.md');
    sessionHistoryText = readRequiredFile(repoRoot, 'SESSION_HISTORY.md');
    healthOutput = readHealthOutput(repoRoot, activeHandoffText);
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
  const truthSnapshot = buildTruthSnapshot(
    activeHandoffText,
    currentStateText,
    sessionHistoryText,
    healthOutput,
  );
  const synthesizedItem =
    !firstActionableItem && !hardStopReason ? synthesizeAppOwnerContract(truthSnapshot) : null;
  const generatedAppOwnerItem =
    synthesizedItem && generatedContractHasLiveFinding(synthesizedItem, truthSnapshot)
      ? synthesizedItem
      : null;
  const selectedItem = firstActionableItem ?? generatedAppOwnerItem;

  if (!hardStopReason && !selectedItem) {
    const externalBlockerStopReason = getExternalBlockerStopReason(
      truthSnapshot,
      waitingExternalBlockerItems,
    );
    if (externalBlockerStopReason) {
      hardStopReason = externalBlockerStopReason;
    } else if (isWholeLoopExplicitlyProven(truthSnapshot)) {
      hardStopReason =
        'All money-loop rungs are currently production-proven in active truth.';
    } else {
      hardStopReason =
        'Unable to synthesize an app-owner seam from current product truth; exact proof or blocker classification is missing.';
    }
  }

  if (!hardStopReason && !selectedItem?.moneyLoopRung?.trim()) {
    hardStopReason = 'Selected backlog item is missing Money loop rung.';
  }

  if (!hardStopReason && selectedItem?.isUserFacing == null) {
    hardStopReason = 'Selected backlog item is missing Is user-facing.';
  }

  if (!hardStopReason && dirtyClassification.blocking.length > 0) {
    const blockingSummary = dirtyClassification.blocking
      .map((entry) => `${entry.path} (${entry.reason})`)
      .join('; ');
    hardStopReason = `Unsafe dirty files exist: ${blockingSummary}`;
  }

  const controllerResult = hardStopReason ? 'STOP' : 'GO';
  const requiredProofSummary = selectedItem
    ? `Local: ${compact(selectedItem.requiredLocalProof)} | Production: ${compact(selectedItem.requiredProductionProof)}`
    : 'UNKNOWN';

  console.log(`CONTROLLER RESULT: ${controllerResult}`);
  console.log(`Selected backlog ID: ${selectedItem?.id ?? 'UNKNOWN'}`);
  console.log(`Title: ${compact(selectedItem?.title)}`);
  console.log(`Rung: ${selectedItem?.rung ?? 'UNKNOWN'}`);
  console.log(`Protected path: ${compact(selectedItem?.userFacingPath)}`);
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
  printSeamContractReport(selectedItem, acceptanceGateText);
  if (controllerResult === 'GO') {
    writeContractFile(repoRoot, selectedItem, acceptanceGateText);
  } else {
    clearContractFile(repoRoot);
  }
  printNextCommand(selectedItem, acceptanceGateText);

  return controllerResult === 'GO' ? 0 : 1;
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exit(runControllerAutopilot());
}
