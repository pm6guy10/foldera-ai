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

  return null;
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
  if (!existsSync(resolve(repoRoot, '.foldera-contract.json'))) {
    return {
      ok: false,
      code: 'missing_contract',
      message: 'Missing .foldera-contract.json. Run npm run controller:autopilot.',
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
