import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
  'ACTIVE_SEAM_STATE.json',
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  '.github/pull_request_template.md',
  '.github/workflows/pr-sentinel.yml',
];

const ACTIVE_HANDOFF_MAX_LINES = 80;

const requiredCloseoutValues = ['updated', 'unchanged - reason', 'not applicable - reason'];
const requiredCloseoutFiles = [
  'ACTIVE_HANDOFF.md',
  'ACTIVE_SEAM_STATE.json',
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
];
const requiredTerminalStates = ['MERGED_AND_CLOSED', 'BLOCKED_WITH_EXACT_RECEIPT', 'HUMAN_REVIEW_REQUIRED_WITH_REASON', 'STOPPED_WITH_AUTHORIZED_REASON'];
const workflowGovernanceAllowlist = [
  '.github/workflows/**',
  '.github/ISSUE_TEMPLATE/**',
  'tests/config/**',
  'scripts/continuity-gate.ts',
  'FOLDERA_MASTER_BIBLE.md',
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'ACTIVE_SEAM_STATE.json',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
];

// Files that are governance-contract-only — editing only these files does not
// constitute a product seam change and may arrive on a different branch than
// the tracked active_branch without representing seam drift.
const GOVERNANCE_CONTRACT_PATTERNS = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'LESSONS_LEARNED.md',
  'SESSION_HISTORY.md',
  'FOLDERA_MASTER_BIBLE.md',
  'scripts/continuity-gate.ts',
  'tests/config/**',
  '.github/workflows/**',
  '.github/ISSUE_TEMPLATE/**',
  '.github/pull_request_template.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
];

// Files that encode active seam state — their presence in a changed-file set
// disqualifies the PR from the governance-only exemption.
const SEAM_STATE_PATTERNS = [
  'ACTIVE_SEAM_STATE.json',
  'FOLDERA_BUILD_ORDER.yaml',
  'ACTIVE_HANDOFF.md',
  '.foldera-contract.json',
];
const forbiddenClaimTerms = [
  'SOC2',
  'SOC 2',
  'HIPAA',
  'compliance-ready',
  'audit-ready',
  'enterprise-grade security',
  'auto-send',
  'automatic send',
  'automatic writeback',
  'cross-app writeback',
  'Slack execution',
  'Teams execution',
  'surveillance',
  'screen-reading',
  'monitors everything',
  'reads your screen',
  'sends for you',
  'guaranteed',
  'fully automated',
];
const publicFacingClaimRoots = ['app', 'components', 'public'];
const publicFacingExtensions = ['.ts', '.tsx', '.js', '.jsx', '.md', '.mdx', '.html', '.json'];

function readRepoFile(root: string, file: string): string {
  return readFileSync(join(root, file), 'utf8');
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesAnyPattern(file: string, patterns: string[]): boolean {
  const normalized = normalizePath(file);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
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

interface ActiveSeamState {
  active_issue?: number | null;
  active_branch?: string | null;
  active_pr?: number | null;
  deployed_commit_sha?: string | null;
  runtime_env?: string | null;
  db_state_version?: string | null;
  last_verified_at?: string | null;
}

function readCurrentBranch(root: string): string | null {
  if (!existsSync(join(root, '.git'))) return null;
  const prHeadBranch = process.env.GITHUB_HEAD_REF?.trim();
  if (prHeadBranch) return prHeadBranch;
  try {
    const branch = execSync('git branch --show-current', {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!branch || branch === 'main') return null;
    return branch;
  } catch {
    return null;
  }
}

function readChangedFilesLocally(root: string): string[] {
  if (!existsSync(join(root, '.git'))) return [];
  for (const base of ['origin/main', 'main']) {
    try {
      const out = execSync(`git diff --name-only ${base}...HEAD`, {
        cwd: root,
        encoding: 'utf8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return out.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
    } catch {
      // base may not be available; try next
    }
  }
  return [];
}

// Returns true only when ALL changed files are governance-contract files AND
// none of them are seam-state files. Empty file lists are treated as unknown →
// conservative false so product PRs with no detectable diff still enforce the
// active_branch rule.
function isGovernanceOnlyChange(changedFiles: string[]): boolean {
  if (changedFiles.length === 0) return false;
  const normalized = changedFiles.map(normalizePath);
  return (
    normalized.every((f) => matchesAnyPattern(f, GOVERNANCE_CONTRACT_PATTERNS)) &&
    !normalized.some((f) => matchesAnyPattern(f, SEAM_STATE_PATTERNS))
  );
}

function readGitHubEventPullRequestNumber(): number | null {
  const eventPath = process.env.GITHUB_EVENT_PATH?.trim();
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    const payload = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      pull_request?: { number?: unknown };
      issue?: { number?: unknown };
    };
    const number = payload.pull_request?.number ?? payload.issue?.number;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

function readActiveSeamState(root: string): ActiveSeamState | null {
  try {
    return JSON.parse(readRepoFile(root, 'ACTIVE_SEAM_STATE.json')) as ActiveSeamState;
  } catch {
    return null;
  }
}

function isIsoTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

export type IssueStateFetcher = (issueNumber: number) => 'open' | 'closed' | 'skip';

export function defaultIssueStateFetcher(issueNumber: number): 'open' | 'closed' | 'skip' {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) return 'skip';
  try {
    const repo = process.env.GITHUB_REPOSITORY ?? 'pm6guy10/foldera-ai';
    const result = execSync(`gh api repos/${repo}/issues/${issueNumber} --jq .state`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result === 'open' ? 'open' : 'closed';
  } catch {
    return 'skip';
  }
}

export function runContinuityGate(root: string, options?: { issueStateFetcher?: IssueStateFetcher; changedFiles?: string[] }): string[] {
  const fetchIssueState = options?.issueStateFetcher ?? defaultIssueStateFetcher;
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
    // Live state check: verify the agreed-upon active issue is still OPEN on GitHub.
    // Skipped when GITHUB_TOKEN / GH_TOKEN is absent (local runs without auth).
    if (buildOrderIssue !== null) {
      const issueState = fetchIssueState(buildOrderIssue);
      if (issueState === 'closed') {
        failures.push(`active_issue #${buildOrderIssue} is CLOSED on GitHub — command state is stale; repair ACTIVE_HANDOFF.md, FOLDERA_BUILD_ORDER.yaml, and .foldera-contract.json before continuing.`);
      }
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

  const activeSeamState = readActiveSeamState(root);
  if (!activeSeamState) {
    failures.push('ACTIVE_SEAM_STATE.json is missing or unreadable.');
  } else {
    const activeIssue = typeof activeSeamState.active_issue === 'number' ? activeSeamState.active_issue : null;
    const activeBranch = typeof activeSeamState.active_branch === 'string' ? activeSeamState.active_branch.trim() : '';
    const activePr =
      typeof activeSeamState.active_pr === 'number' && Number.isFinite(activeSeamState.active_pr)
        ? activeSeamState.active_pr
        : activeSeamState.active_pr === null
          ? null
          : undefined;
    const deployedSha =
      typeof activeSeamState.deployed_commit_sha === 'string' ? activeSeamState.deployed_commit_sha.trim() : '';
    const runtimeEnv =
      typeof activeSeamState.runtime_env === 'string' ? activeSeamState.runtime_env.trim() : '';
    const dbStateVersion =
      typeof activeSeamState.db_state_version === 'string' ? activeSeamState.db_state_version.trim() : '';
    const lastVerifiedAt =
      typeof activeSeamState.last_verified_at === 'string' ? activeSeamState.last_verified_at.trim() : '';

    if (activeIssue === null) {
      failures.push('ACTIVE_SEAM_STATE.json must set active_issue.');
    } else if (buildOrderIssue !== null && activeIssue !== buildOrderIssue) {
      failures.push(
        `ACTIVE_SEAM_STATE.json active_issue #${activeIssue} must match FOLDERA_BUILD_ORDER.yaml active_issue #${buildOrderIssue}.`,
      );
    }

    const currentBranch = readCurrentBranch(root);
    if (!activeBranch) {
      failures.push('ACTIVE_SEAM_STATE.json must set active_branch.');
    } else if (currentBranch && activeBranch !== currentBranch) {
      const changedFiles = options?.changedFiles ?? readChangedFilesLocally(root);
      if (!isGovernanceOnlyChange(changedFiles)) {
        failures.push(
          `ACTIVE_SEAM_STATE.json active_branch "${activeBranch}" must match current branch "${currentBranch}".`,
        );
      }
    }

    const currentPrNumber = readGitHubEventPullRequestNumber();
    if (activePr === undefined) {
      failures.push('ACTIVE_SEAM_STATE.json active_pr must be a number or null.');
    } else if (currentPrNumber !== null && activePr !== currentPrNumber) {
      failures.push(
        `ACTIVE_SEAM_STATE.json active_pr ${activePr ?? 'null'} must match GitHub event PR #${currentPrNumber}.`,
      );
    }

    const deployedShaEnv =
      process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      process.env.DEPLOYED_COMMIT_SHA?.trim() ||
      null;
    if (!deployedSha) {
      failures.push('ACTIVE_SEAM_STATE.json must set deployed_commit_sha.');
    } else if (deployedShaEnv && deployedSha !== deployedShaEnv) {
      failures.push(
        `ACTIVE_SEAM_STATE.json deployed_commit_sha ${deployedSha} must match deployed SHA ${deployedShaEnv}.`,
      );
    }

    const expectedDbStateVersion = process.env.FOLDERA_DB_STATE_VERSION?.trim() || null;
    if (!runtimeEnv) {
      failures.push('ACTIVE_SEAM_STATE.json must set runtime_env.');
    }

    if (!dbStateVersion) {
      failures.push('ACTIVE_SEAM_STATE.json must set db_state_version.');
    } else if (expectedDbStateVersion && dbStateVersion !== expectedDbStateVersion) {
      failures.push(
        `ACTIVE_SEAM_STATE.json db_state_version ${dbStateVersion} must match FOLDERA_DB_STATE_VERSION ${expectedDbStateVersion}.`,
      );
    }

    if (!lastVerifiedAt) {
      failures.push('ACTIVE_SEAM_STATE.json must set last_verified_at.');
    } else if (!isIsoTimestamp(lastVerifiedAt)) {
      failures.push('ACTIVE_SEAM_STATE.json last_verified_at must be a valid ISO timestamp.');
    }
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

export function validateContractFileDiff(root: string, changedFiles: string[]): string[] {
  const failures: string[] = [];
  const contract = JSON.parse(readRepoFile(root, '.foldera-contract.json')) as {
    allowed_file_patterns?: unknown;
    forbidden_file_patterns?: unknown;
  };
  const allowedPatterns = Array.isArray(contract.allowed_file_patterns)
    ? contract.allowed_file_patterns.filter((pattern): pattern is string => typeof pattern === 'string')
    : [];
  const forbiddenPatterns = Array.isArray(contract.forbidden_file_patterns)
    ? contract.forbidden_file_patterns.filter((pattern): pattern is string => typeof pattern === 'string')
    : [];
  for (const file of changedFiles.map(normalizePath)) {
    if (matchesAnyPattern(file, forbiddenPatterns)) {
      failures.push(`Forbidden file change: ${file} matches .foldera-contract.json forbidden_file_patterns.`);
      continue;
    }
    if (!matchesAnyPattern(file, allowedPatterns) && !matchesAnyPattern(file, workflowGovernanceAllowlist)) {
      failures.push(`Unauthorized file change: ${file} is not allowed by .foldera-contract.json allowed_file_patterns.`);
    }
  }
  return failures;
}

export function validatePullRequestReceipt(body: string | null | undefined): string[] {
  const failures: string[] = [];
  const prBody = body ?? '';
  if (!prBody.includes('## Source-truth closeout')) failures.push('PR receipt is missing ## Source-truth closeout.');
  if (!prBody.includes('## Next seam')) failures.push('PR receipt is missing ## Next seam.');
  if (!prBody.includes('- Run Ledger ID:')) failures.push('PR receipt is missing Run Ledger ID.');
  for (const file of requiredCloseoutFiles) {
    const escaped = file.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const match = prBody.match(new RegExp(`-\\s+\`${escaped}\`:\\s*([^\\r\\n]+)`, 'i'));
    if (!match) {
      failures.push(`PR receipt is missing source-truth closeout row for ${file}.`);
      continue;
    }
    const value = match[1].trim().toLowerCase();
    if (!requiredCloseoutValues.includes(value)) {
      failures.push(`PR receipt row for ${file} must be one of: ${requiredCloseoutValues.join(', ')}.`);
    }
  }
  return failures;
}

function extractIssueNumbers(raw: string): number[] {
  const numbers = new Set<number>();
  for (const match of raw.matchAll(/(?:issue\s*)?#(\d+)/gi)) {
    numbers.add(Number(match[1]));
  }
  return [...numbers];
}

export function validateActiveSeamPullRequest(
  root: string,
  pullRequest: { title?: string | null; body?: string | null; branch?: string | null },
): string[] {
  const failures: string[] = [];
  const buildOrder = readRepoFile(root, 'FOLDERA_BUILD_ORDER.yaml');
  const activeIssue = extractYamlNumber(buildOrder, 'active_issue');
  if (activeIssue === null) return ['Active-seam protection failed: FOLDERA_BUILD_ORDER.yaml active_issue is not a numbered issue.'];
  const issueNumbers = extractIssueNumbers(`${pullRequest.title ?? ''}\n${pullRequest.body ?? ''}\n${pullRequest.branch ?? ''}`);
  if (!issueNumbers.includes(activeIssue)) {
    const target = issueNumbers[0] ?? 'none';
    failures.push(`Active-seam protection failed: PR targets issue #${target} but FOLDERA_BUILD_ORDER.yaml active_issue is #${activeIssue}.`);
  }
  return failures;
}

function walkFiles(root: string, relativeDir = ''): string[] {
  const absoluteDir = join(root, relativeDir);
  if (!existsSync(absoluteDir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    const relative = normalizePath(join(relativeDir, entry));
    const absolute = join(root, relative);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'tests', '__tests__'].includes(entry)) {
        files.push(...walkFiles(root, relative));
      }
    } else {
      files.push(relative);
    }
  }
  return files;
}

function isNegatedClaim(line: string, term: string): boolean {
  const normalizedLine = line.toLowerCase();
  const normalizedTerm = term.toLowerCase();
  const index = normalizedLine.indexOf(normalizedTerm);
  if (index === -1) return false;
  const prefix = normalizedLine.slice(Math.max(0, index - 40), index);
  return /\b(no|not|never|without)\b/.test(prefix) || /\bdo\s+not\s*$/.test(prefix);
}

export function findForbiddenClaimFailures(root: string): string[] {
  const failures: string[] = [];
  const files = publicFacingClaimRoots.flatMap((dir) => walkFiles(root, dir));
  for (const file of files) {
    const normalized = normalizePath(file);
    if (!publicFacingExtensions.some((extension) => normalized.endsWith(extension))) continue;
    const body = readRepoFile(root, normalized);
    const lines = body.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const term of forbiddenClaimTerms) {
        if (line.toLowerCase().includes(term.toLowerCase()) && !isNegatedClaim(line, term)) {
          failures.push(`Forbidden public-facing claim in ${normalized}:${index + 1}: ${term}`);
        }
      }
    });
  }
  return failures;
}

function readChangedFilesFromGitHubEvent(root: string): string[] {
  const baseRef = process.env.GITHUB_BASE_REF?.trim();
  if (!baseRef) return [];
  try {
    execSync(`git fetch origin ${baseRef} --depth=1`, {
      cwd: root,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // The diff below may still work when checkout already has the base ref.
  }
  try {
    return execSync(`git diff --name-only origin/${baseRef}...HEAD`, {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readPullRequestFromEvent(): { title?: string | null; body?: string | null; branch?: string | null } | null {
  const eventPath = process.env.GITHUB_EVENT_PATH?.trim();
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    const payload = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      pull_request?: {
        title?: string | null;
        body?: string | null;
        head?: { ref?: string | null };
      };
    };
    if (!payload.pull_request) return null;
    return {
      title: payload.pull_request.title,
      body: payload.pull_request.body,
      branch: payload.pull_request.head?.ref,
    };
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  const failures = runContinuityGate(root);
  const pullRequest = readPullRequestFromEvent();
  if (pullRequest) {
    failures.push(...validatePullRequestReceipt(pullRequest.body));
    failures.push(...validateActiveSeamPullRequest(root, pullRequest));
    const changedFiles = readChangedFilesFromGitHubEvent(root);
    if (changedFiles.length === 0) {
      failures.push('PR Sentinel could not determine changed files for contract enforcement.');
    } else {
      failures.push(...validateContractFileDiff(root, changedFiles));
    }
  }
  failures.push(...findForbiddenClaimFailures(root));
  if (failures.length > 0) {
    console.error('Continuity gate failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Continuity gate passed.');
}
