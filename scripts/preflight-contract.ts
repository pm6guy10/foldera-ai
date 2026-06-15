import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export type ContractValidationStage = 'manual' | 'pre-commit' | 'pre-push';

export interface FolderaRunContract {
  backlog_id: string;
  generated_contract_id?: string;
  base_commit: string;
  money_loop_rung: string;
  user_system_path?: string;
  allowed_file_patterns: string[];
  forbidden_file_patterns?: string[];
  allowed_files_raw: string;
  forbidden_files_raw: string;
  required_local_proof: string;
  required_product_proof?: string;
  required_browser_proof: string;
  acceptance_condition?: string;
  stop_condition?: string;
  source_truth_file?: string;
  source_truth_finding?: string;
  required_closure_update?: string;
  is_user_facing: boolean;
  browser_proof_command: string;
  anti_regression_checks: string[];
  next_command: string;
}

export interface ContractValidationResult {
  ok: boolean;
  code:
    | 'ok'
    | 'missing_contract'
    | 'invalid_contract'
    | 'stale_base_commit'
    | 'git_error'
    | 'files_outside_contract'
    | 'forbidden_files_touched';
  message: string;
  touchedFiles: string[];
  violations: string[];
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function runGit(
  repoRoot: string,
  args: string[],
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) {
    return { status: 1, stdout: '', stderr: result.error.message };
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// Governance-gate files may be edited on any branch without being in the
// active product contract's allowed_file_patterns. They carry no seam state
// and do not affect runtime, schema, or UI.
const GOVERNANCE_GATE_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'LESSONS_LEARNED.md',
  'scripts/continuity-gate.ts',
  'scripts/preflight-contract.ts',
]);

function touchesOnlyGovernanceGateFiles(files: string[]): boolean {
  if (files.length === 0) return false;
  return files.every(
    (f) => GOVERNANCE_GATE_FILES.has(f) || f.startsWith('tests/config/'),
  );
}

const STOP_STATE_CONTRACTLESS_FILES = new Set([
  '.foldera-contract.json',
  'ACTIVE_HANDOFF.md',
  'CURRENT_STATE.md',
  'SESSION_HISTORY.md',
  'scripts/controller-autopilot.ts',
  'scripts/preflight-contract.ts',
  'scripts/__tests__/controller-autopilot.test.ts',
  'scripts/__tests__/preflight-contract.test.ts',
]);

const RELEASE_GATE_CONTRACTLESS_FILES = new Set([
  'ACTIVE_HANDOFF.md',
  'SESSION_HISTORY.md',
  'package.json',
  'docs/RELEASE_GATES.md',
  'docs/REAL_NON_OWNER_BETA_PROOF_CHECKLIST.md',
  'docs/OWNER_CANARY_TEST_RUNBOOK.md',
  'lib/config/constants.ts',
  'lib/cron/acceptance-gate.ts',
  'lib/cron/__tests__/acceptance-gate.test.ts',
  'lib/ops/beta-readiness.ts',
  'scripts/release-gate-status.ts',
  'scripts/__tests__/release-gate-status.test.ts',
  'scripts/preflight-contract.ts',
  'scripts/__tests__/preflight-contract.test.ts',
]);

const QUALITY_GATE_CONTRACTLESS_FILES = new Set([
  'ACTIVE_HANDOFF.md',
  'SESSION_HISTORY.md',
  'package.json',
  'docs/QUALITY_GATES.md',
  'scripts/quality-gate-status.ts',
  'scripts/__tests__/quality-gate-status.test.ts',
  'scripts/decision-trace-gate-status.ts',
  'scripts/__tests__/decision-trace-gate-status.test.ts',
  'scripts/preflight-contract.ts',
  'scripts/__tests__/preflight-contract.test.ts',
]);

const VISUAL_GATE_CONTRACTLESS_FILES = new Set([
  'ACTIVE_HANDOFF.md',
  'SESSION_HISTORY.md',
  'package.json',
  'docs/QUALITY_GATES.md',
  'tests/dashboard/live-artifact-pixel-lock.spec.ts',
  'tests/e2e/landing-dashboard-visual.spec.ts',
  'scripts/visual-gate-status.ts',
  'scripts/__tests__/visual-gate-status.test.ts',
  'scripts/preflight-contract.ts',
  'scripts/__tests__/preflight-contract.test.ts',
]);

const ACTIVE_HANDOFF_MAX_LINES = 80;

function validateActiveHandoffCockpit(repoRoot: string): string | null {
  const handoffPath = resolve(repoRoot, 'ACTIVE_HANDOFF.md');
  if (!existsSync(handoffPath)) {
    return null;
  }

  const activeHandoff = readFileSync(handoffPath, 'utf8');
  const lineCount = activeHandoff.split(/\r?\n/).length;
  if (lineCount > ACTIVE_HANDOFF_MAX_LINES) {
    return `ACTIVE_HANDOFF.md is ${lineCount} lines; keep the current command-state cockpit at <= ${ACTIVE_HANDOFF_MAX_LINES} lines before pushing.`;
  }

  for (const requiredText of ['# ACTIVE HANDOFF', 'Current slice:', '## Next exact move']) {
    if (!activeHandoff.includes(requiredText)) {
      return `ACTIVE_HANDOFF.md is missing required cockpit marker: ${requiredText}`;
    }
  }

  return null;
}

function parseNameStatus(raw: string): { status: string; path: string }[] {
  return raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status = '', ...rest] = line.split(/\s+/);
      return { status, path: normalizeRepoPath(rest.join(' ')) };
    })
    .filter((entry) => entry.path.length > 0);
}

function getPrePushComparisonBase(repoRoot: string): string | null {
  const upstream = runGit(repoRoot, ['merge-base', 'origin/main', 'HEAD']);
  if (upstream.status === 0 && upstream.stdout.trim()) {
    return upstream.stdout.trim();
  }

  const parent = runGit(repoRoot, ['rev-parse', 'HEAD~1']);
  if (parent.status === 0 && parent.stdout.trim()) {
    return parent.stdout.trim();
  }

  return null;
}

function contractIsAbsentAtHead(repoRoot: string): boolean {
  const result = runGit(repoRoot, ['cat-file', '-e', 'HEAD:.foldera-contract.json']);
  return result.status !== 0;
}

function getContractlessStopStateFiles(
  repoRoot: string,
  stage: ContractValidationStage,
): { ok: boolean; files: string[] } {
  const diffArgs =
    stage === 'pre-commit'
      ? ['diff', '--cached', '--name-status']
      : (() => {
          const base = getPrePushComparisonBase(repoRoot);
          return base ? ['diff', '--name-status', `${base}..HEAD`] : null;
        })();

  if (!diffArgs) {
    return { ok: false, files: [] };
  }

  const result = runGit(repoRoot, diffArgs);
  if (result.status !== 0) {
    return { ok: false, files: [] };
  }

  const entries = parseNameStatus(result.stdout);
  const files = entries.map((entry) => entry.path);
  const deletesContract = entries.some(
    (entry) => entry.status.startsWith('D') && entry.path === '.foldera-contract.json',
  );
  const onlyStopStateFiles = files.every((file) => STOP_STATE_CONTRACTLESS_FILES.has(file));
  const isStopStateFollowUp =
    contractIsAbsentAtHead(repoRoot) &&
    files.length > 0 &&
    onlyStopStateFiles;

  return {
    ok: (deletesContract && onlyStopStateFiles) || isStopStateFollowUp,
    files,
  };
}

function getContractlessReleaseGateFiles(
  repoRoot: string,
  stage: ContractValidationStage,
): { ok: boolean; files: string[] } {
  const diffArgs =
    stage === 'pre-commit'
      ? ['diff', '--cached', '--name-only']
      : (() => {
          const base = getPrePushComparisonBase(repoRoot);
          return base ? ['diff', '--name-only', `${base}..HEAD`] : null;
        })();

  if (!diffArgs) {
    return { ok: false, files: [] };
  }

  const result = runGit(repoRoot, diffArgs);
  if (result.status !== 0) {
    return { ok: false, files: [] };
  }

  const files = parseTouchedFiles(result.stdout);
  const touchesReleaseGate =
    files.includes('scripts/release-gate-status.ts') ||
    files.includes('docs/RELEASE_GATES.md') ||
    files.includes('scripts/__tests__/release-gate-status.test.ts');
  const onlyReleaseGateFiles =
    files.length > 0 && files.every((file) => RELEASE_GATE_CONTRACTLESS_FILES.has(file));

  return {
    ok: contractIsAbsentAtHead(repoRoot) && touchesReleaseGate && onlyReleaseGateFiles,
    files,
  };
}

function getContractlessQualityGateFiles(
  repoRoot: string,
  stage: ContractValidationStage,
): { ok: boolean; files: string[] } {
  const diffArgs =
    stage === 'pre-commit'
      ? ['diff', '--cached', '--name-only']
      : (() => {
          const base = getPrePushComparisonBase(repoRoot);
          return base ? ['diff', '--name-only', `${base}..HEAD`] : null;
        })();

  if (!diffArgs) {
    return { ok: false, files: [] };
  }

  const result = runGit(repoRoot, diffArgs);
  if (result.status !== 0) {
    return { ok: false, files: [] };
  }

  const files = parseTouchedFiles(result.stdout);
  const touchesQualityGate =
    files.includes('scripts/quality-gate-status.ts') ||
    files.includes('scripts/decision-trace-gate-status.ts') ||
    files.includes('docs/QUALITY_GATES.md') ||
    files.includes('scripts/__tests__/quality-gate-status.test.ts') ||
    files.includes('scripts/__tests__/decision-trace-gate-status.test.ts');
  const onlyQualityGateFiles =
    files.length > 0 && files.every((file) => QUALITY_GATE_CONTRACTLESS_FILES.has(file));

  return {
    ok: contractIsAbsentAtHead(repoRoot) && touchesQualityGate && onlyQualityGateFiles,
    files,
  };
}

function getContractlessVisualGateFiles(
  repoRoot: string,
  stage: ContractValidationStage,
): { ok: boolean; files: string[] } {
  const diffArgs =
    stage === 'pre-commit'
      ? ['diff', '--cached', '--name-only']
      : (() => {
          const base = getPrePushComparisonBase(repoRoot);
          return base ? ['diff', '--name-only', `${base}..HEAD`] : null;
        })();

  if (!diffArgs) {
    return { ok: false, files: [] };
  }

  const result = runGit(repoRoot, diffArgs);
  if (result.status !== 0) {
    return { ok: false, files: [] };
  }

  const files = parseTouchedFiles(result.stdout);
  const touchesVisualGate =
    files.includes('scripts/visual-gate-status.ts') ||
    files.includes('docs/QUALITY_GATES.md') ||
    files.includes('scripts/__tests__/visual-gate-status.test.ts');
  const onlyVisualGateFiles =
    files.length > 0 && files.every((file) => VISUAL_GATE_CONTRACTLESS_FILES.has(file));

  return {
    ok: contractIsAbsentAtHead(repoRoot) && touchesVisualGate && onlyVisualGateFiles,
    files,
  };
}

function splitContractList(raw: string | null | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim().replace(/^[-*]\s+/, '').trim())
    .map((entry) => entry.replace(/^`+|`+$/g, '').trim())
    .filter(Boolean);
}

function isPathShapedContractEntry(entry: string): boolean {
  if (/\s/.test(entry)) return false;
  if (/^(?:auth|billing|product|provider|broad|unrelated|visual|styling)$/i.test(entry)) {
    return false;
  }

  const knownPathRoot = /^(?:app|components|docs|lib|public|scripts|supabase|tests|\.github|\.husky)\//;
  return (
    knownPathRoot.test(entry) ||
    entry.startsWith('.') ||
    /\.[a-z0-9*]+$/i.test(entry) ||
    entry.includes('*')
  );
}

export function normalizeContractFilePatterns(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const patterns: string[] = [];

  for (const entry of splitContractList(raw)) {
    const normalized = normalizeRepoPath(entry);
    if (!isPathShapedContractEntry(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    patterns.push(normalized);
  }

  return patterns;
}

function normalizePatternList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => (typeof entry === 'string' ? normalizeRepoPath(entry) : ''))
    .filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function fileMatchesContractPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRepoPath(path);
  const normalizedPattern = normalizeRepoPath(pattern);
  const regexSource = escapeRegex(normalizedPattern)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]*');

  return new RegExp(`^${regexSource}$`).test(normalizedPath);
}

function parseTouchedFiles(output: string): string[] {
  return output
    .split(/\r?\n/g)
    .map((line) => normalizeRepoPath(line))
    .filter((line) => line && line !== '.foldera-contract.json')
    .sort();
}

function loadContract(repoRoot: string): FolderaRunContract | null {
  try {
    const raw = readFileSync(resolve(repoRoot, '.foldera-contract.json'), 'utf8');
    return JSON.parse(raw) as FolderaRunContract;
  } catch {
    return null;
  }
}

function isExplicitBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function isAppendOnlyUpdate(previousContent: string, nextContent: string): boolean {
  const normalizedPrevious = previousContent.replace(/\r\n/g, '\n');
  const normalizedNext = nextContent.replace(/\r\n/g, '\n');
  return normalizedNext.startsWith(normalizedPrevious);
}

function contractAllowsPath(contract: FolderaRunContract, path: string): boolean {
  const allowed = normalizePatternList(contract.allowed_file_patterns);
  return allowed.some((pattern) => fileMatchesContractPattern(path, pattern));
}

function validateContractMetadata(contract: FolderaRunContract): string | null {
  if (!contract.money_loop_rung?.trim()) {
    return '.foldera-contract.json is missing money_loop_rung. Re-run controller after fixing the backlog item.';
  }

  if (!isExplicitBoolean(contract.is_user_facing)) {
    return '.foldera-contract.json is missing an explicit is_user_facing boolean. Re-run controller after fixing the backlog item.';
  }

  if (contract.is_user_facing && !contract.browser_proof_command?.trim()) {
    return '.foldera-contract.json is missing browser_proof_command for a user-facing seam. Re-run controller after fixing the backlog item.';
  }

  if (contract.generated_contract_id) {
    if (!contract.source_truth_file?.trim()) {
      return '.foldera-contract.json is missing source_truth_file for a generated contract. Re-run controller after fixing the backlog item.';
    }

    if (!contract.source_truth_finding?.trim()) {
      return '.foldera-contract.json is missing source_truth_finding for a generated contract. Re-run controller after fixing the backlog item.';
    }

    if (!contract.required_closure_update?.trim()) {
      return '.foldera-contract.json is missing required_closure_update for a generated contract. Re-run controller after fixing the backlog item.';
    }

    if (!contractAllowsPath(contract, contract.source_truth_file)) {
      return `.foldera-contract.json source_truth_file ${contract.source_truth_file} is not allowed by allowed_file_patterns. Re-run controller after fixing the generated contract closure scope.`;
    }
  }

  return null;
}

function readFileAtRef(repoRoot: string, ref: string, path: string): string | null {
  const result = runGit(repoRoot, ['show', `${ref}:${path}`]);
  if (result.status !== 0) {
    return null;
  }

  return result.stdout;
}

function getTouchedFiles(
  repoRoot: string,
  stage: ContractValidationStage,
  baseCommit: string,
): { ok: boolean; files: string[]; message: string } {
  const diffArgs =
    stage === 'pre-commit'
      ? ['diff', '--cached', '--name-only', '--diff-filter=ACMRT']
      : ['diff', '--name-only', '--diff-filter=ACMRT', `${baseCommit}..HEAD`];

  const result = runGit(repoRoot, diffArgs);
  if (result.status !== 0) {
    return {
      ok: false,
      files: [],
      message: result.stderr.trim() || `git ${diffArgs.join(' ')} failed`,
    };
  }

  return { ok: true, files: parseTouchedFiles(result.stdout), message: '' };
}

export function validateContractForStage(
  repoRoot: string,
  stage: ContractValidationStage,
): ContractValidationResult {
  const activeHandoffError = validateActiveHandoffCockpit(repoRoot);
  if (activeHandoffError) {
    return {
      ok: false,
      code: 'invalid_contract',
      message: activeHandoffError,
      touchedFiles: ['ACTIVE_HANDOFF.md'],
      violations: ['ACTIVE_HANDOFF.md'],
    };
  }

  if (!existsSync(resolve(repoRoot, '.foldera-contract.json'))) {
    if (stage === 'pre-commit' || stage === 'pre-push') {
      const stopState = getContractlessStopStateFiles(repoRoot, stage);
      if (stopState.ok) {
        return {
          ok: true,
          code: 'ok',
          message: 'Contractless controller STOP state is valid.',
          touchedFiles: stopState.files,
          violations: [],
        };
      }

      const releaseGateState = getContractlessReleaseGateFiles(repoRoot, stage);
      if (releaseGateState.ok) {
        return {
          ok: true,
          code: 'ok',
          message: 'Contractless release-gate controller update is valid.',
          touchedFiles: releaseGateState.files,
          violations: [],
        };
      }

      const qualityGateState = getContractlessQualityGateFiles(repoRoot, stage);
      if (qualityGateState.ok) {
        return {
          ok: true,
          code: 'ok',
          message: 'Contractless quality-gate controller update is valid.',
          touchedFiles: qualityGateState.files,
          violations: [],
        };
      }

      const visualGateState = getContractlessVisualGateFiles(repoRoot, stage);
      if (visualGateState.ok) {
        return {
          ok: true,
          code: 'ok',
          message: 'Contractless visual-gate controller update is valid.',
          touchedFiles: visualGateState.files,
          violations: [],
        };
      }
    }

    return {
      ok: false,
      code: 'missing_contract',
      message: 'Missing .foldera-contract.json. Restore it from main or write one for the active issue.',
      touchedFiles: [],
      violations: [],
    };
  }

  const contract = loadContract(repoRoot);
  const baseCommit = contract?.base_commit?.trim();
  if (!contract || !baseCommit) {
    return {
      ok: false,
      code: 'invalid_contract',
      message: '.foldera-contract.json is unreadable or missing base_commit.',
      touchedFiles: [],
      violations: [],
    };
  }

  const metadataError = validateContractMetadata(contract);
  if (metadataError) {
    return {
      ok: false,
      code: 'invalid_contract',
      message: metadataError,
      touchedFiles: [],
      violations: [],
    };
  }

  const ancestor = runGit(repoRoot, ['merge-base', '--is-ancestor', baseCommit, 'HEAD']);
  if (ancestor.status !== 0) {
    return {
      ok: false,
      code: 'stale_base_commit',
      message: 'Contract base_commit is not an ancestor of HEAD. Re-run controller.',
      touchedFiles: [],
      violations: [],
    };
  }

  const touched = getTouchedFiles(repoRoot, stage, baseCommit);
  if (!touched.ok) {
    return {
      ok: false,
      code: 'git_error',
      message: touched.message,
      touchedFiles: [],
      violations: [],
    };
  }

  if (touched.files.includes('SESSION_HISTORY.md')) {
    const correctionAllowed =
      contract.source_truth_file === 'SESSION_HISTORY.md' &&
      /\b(correct|correction|repair|rewrite|amend)\b/i.test(
        contract.required_closure_update ?? '',
      );

    if (!correctionAllowed) {
      const previousContent = readFileAtRef(repoRoot, baseCommit, 'SESSION_HISTORY.md') ?? '';
      const nextContent =
        stage === 'pre-commit'
          ? readFileSync(resolve(repoRoot, 'SESSION_HISTORY.md'), 'utf8')
          : readFileAtRef(repoRoot, 'HEAD', 'SESSION_HISTORY.md') ?? '';

      if (!isAppendOnlyUpdate(previousContent, nextContent)) {
        return {
          ok: false,
          code: 'invalid_contract',
          message:
            'SESSION_HISTORY.md must remain append-only for new receipts unless the contract explicitly requires a history correction.',
          touchedFiles: touched.files,
          violations: ['SESSION_HISTORY.md'],
        };
      }
    }
  }

  const allowed = normalizePatternList(contract.allowed_file_patterns);
  const forbidden = normalizePatternList(contract.forbidden_file_patterns);
  const forbiddenTouched = touched.files.filter((file) =>
    forbidden.some((pattern) => fileMatchesContractPattern(file, pattern)),
  );

  if (forbiddenTouched.length > 0) {
    return {
      ok: false,
      code: 'forbidden_files_touched',
      message: `Forbidden files touched: ${forbiddenTouched.join(', ')}`,
      touchedFiles: touched.files,
      violations: forbiddenTouched,
    };
  }

  if (touchesOnlyGovernanceGateFiles(touched.files)) {
    return {
      ok: true,
      code: 'ok',
      message: 'Governance gate update; file scope exempt from product contract.',
      touchedFiles: touched.files,
      violations: [],
    };
  }

  const outsideAllowed =
    allowed.length === 0
      ? touched.files
      : touched.files.filter(
          (file) => !allowed.some((pattern) => fileMatchesContractPattern(file, pattern)),
        );

  if (outsideAllowed.length > 0) {
    return {
      ok: false,
      code: 'files_outside_contract',
      message: `Files outside contract: ${outsideAllowed.join(', ')}`,
      touchedFiles: touched.files,
      violations: outsideAllowed,
    };
  }

  return {
    ok: true,
    code: 'ok',
    message: 'Contract file scope passed.',
    touchedFiles: touched.files,
    violations: [],
  };
}
