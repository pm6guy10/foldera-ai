import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  normalizeContractFilePatterns,
  validateContractForStage,
} from '../preflight-contract';

function commitAll(repoDir: string, message: string) {
  execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
  execSync(`git -c user.name=Test -c user.email=test@example.com commit -m "${message}"`, {
    cwd: repoDir,
    stdio: 'ignore',
  });
}

function makeRepo(): { repoDir: string; baseCommit: string } {
  const repoDir = mkdtempSync(join(tmpdir(), 'foldera-contract-'));
  execSync('git init', { cwd: repoDir, stdio: 'ignore' });
  writeFileSync(join(repoDir, 'README.md'), 'init\n');
  commitAll(repoDir, 'init');
  const baseCommit = execSync('git rev-parse HEAD', {
    cwd: repoDir,
    encoding: 'utf8',
  }).trim();
  return { repoDir, baseCommit };
}

function writeContract(
  repoDir: string,
  contract: {
    base_commit: string;
    money_loop_rung?: string;
    is_user_facing?: boolean;
    browser_proof_command?: string;
    allowed_file_patterns?: string[];
    forbidden_file_patterns?: string[];
    generated_contract_id?: string;
    source_truth_file?: string;
    source_truth_finding?: string;
    required_closure_update?: string;
  },
) {
  writeFileSync(
    join(repoDir, '.foldera-contract.json'),
    JSON.stringify(
      {
        backlog_id: 'BL-777',
        generated_contract_id: contract.generated_contract_id,
        base_commit: contract.base_commit,
        money_loop_rung: contract.money_loop_rung ?? 'produce_finished_work',
        allowed_file_patterns: contract.allowed_file_patterns ?? [],
        forbidden_file_patterns: contract.forbidden_file_patterns ?? [],
        required_local_proof: 'npm test',
        required_browser_proof: '',
        source_truth_file: contract.source_truth_file,
        source_truth_finding: contract.source_truth_finding,
        required_closure_update: contract.required_closure_update,
        is_user_facing: contract.is_user_facing ?? false,
        browser_proof_command: contract.browser_proof_command ?? '',
        anti_regression_checks: [],
        next_command: 'Run FOLDERA CONTROLLED AUTOPILOT.',
      },
      null,
      2,
    ),
  );
}

describe('preflight contract validation', () => {
  it('fails when the contract file is missing', () => {
    const { repoDir } = makeRepo();
    try {
      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('missing_contract');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows a staged controller STOP cleanup to remove a stale contract', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'old\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'controller-autopilot.test.ts'),
        'old\n',
      );
      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), 'old\n');
      writeFileSync(join(repoDir, 'SESSION_HISTORY.md'), 'old\n');
      commitAll(repoDir, 'contract');

      rmSync(join(repoDir, '.foldera-contract.json'));
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'new\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'controller-autopilot.test.ts'),
        'new\n',
      );
      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), 'new\n');
      writeFileSync(join(repoDir, 'SESSION_HISTORY.md'), 'new\n');
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toContain('.foldera-contract.json');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows a committed controller STOP cleanup without a contract during pre-push', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'old\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'controller-autopilot.test.ts'),
        'old\n',
      );
      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), 'old\n');
      writeFileSync(join(repoDir, 'SESSION_HISTORY.md'), 'old\n');
      commitAll(repoDir, 'contract');

      rmSync(join(repoDir, '.foldera-contract.json'));
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'new\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'controller-autopilot.test.ts'),
        'new\n',
      );
      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), 'new\n');
      writeFileSync(join(repoDir, 'SESSION_HISTORY.md'), 'new\n');
      commitAll(repoDir, 'stop cleanup');

      const result = validateContractForStage(repoDir, 'pre-push');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toContain('.foldera-contract.json');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows controller STOP follow-up files when HEAD is already contractless', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'old\n');
      commitAll(repoDir, 'contract');

      rmSync(join(repoDir, '.foldera-contract.json'));
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'stop\n');
      commitAll(repoDir, 'stop cleanup');

      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'follow-up\n');
      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), 'follow-up\n');
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining(['ACTIVE_HANDOFF.md', 'scripts/preflight-contract.ts']),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows pre-push receipt follow-up files when the pushed range is already contractless', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'old\n');
      commitAll(repoDir, 'contract');

      rmSync(join(repoDir, '.foldera-contract.json'));
      writeFileSync(join(repoDir, 'scripts', 'controller-autopilot.ts'), 'stop\n');
      commitAll(repoDir, 'stop cleanup');

      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), 'receipt\n');
      writeFileSync(join(repoDir, 'SESSION_HISTORY.md'), 'receipt\n');
      commitAll(repoDir, 'receipt cleanup');

      const result = validateContractForStage(repoDir, 'pre-push');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining(['ACTIVE_HANDOFF.md', 'SESSION_HISTORY.md']),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('fails when base_commit is not an ancestor of HEAD', () => {
    const { repoDir } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: '0000000000000000000000000000000000000000',
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });

      const result = validateContractForStage(repoDir, 'pre-push');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('stale_base_commit');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('fails when a user-facing contract is missing browser_proof_command', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
        is_user_facing: true,
        browser_proof_command: '',
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('invalid_contract');
      expect(result.message).toContain('browser_proof_command');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('fails when a generated contract does not allow its source-truth closure file', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
        generated_contract_id: 'GENERATED-CANDIDATE-SELECTION-CONVERGENCE',
        source_truth_file: 'CURRENT_STATE.md',
        source_truth_finding: 'Convergence depends on name overlap',
        required_closure_update: 'Update CURRENT_STATE.md to retire the triggering finding.',
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('invalid_contract');
      expect(result.message).toContain('source_truth_file');
      expect(result.message).toContain('CURRENT_STATE.md');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('fails staged files outside allowed_file_patterns in pre-commit mode', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });
      mkdirSync(join(repoDir, 'app'), { recursive: true });
      writeFileSync(join(repoDir, 'app/page.tsx'), 'export default function Page() {}\n');
      execSync('git add app/page.tsx', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('files_outside_contract');
      expect(result.violations).toEqual(['app/page.tsx']);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('fails committed files outside allowed_file_patterns since base_commit in pre-push mode', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/controller-autopilot.ts'],
      });
      writeFileSync(join(repoDir, 'README.md'), 'changed\n');
      commitAll(repoDir, 'outside contract');

      const result = validateContractForStage(repoDir, 'pre-push');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('files_outside_contract');
      expect(result.violations).toEqual(['README.md']);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('rejects SESSION_HISTORY rewrites when the contract only allows append-only receipts', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeFileSync(
        join(repoDir, 'SESSION_HISTORY.md'),
        `## 2026-05-10 - Prior seam
- Files changed: none
- Verification: pass
`,
      );
      commitAll(repoDir, 'add history');
      const historyBaseCommit = execSync('git rev-parse HEAD', {
        cwd: repoDir,
        encoding: 'utf8',
      }).trim();

      writeContract(repoDir, {
        base_commit: historyBaseCommit,
        generated_contract_id: 'GENERATED-CURRENT-STATE-CLOSURE',
        source_truth_file: 'CURRENT_STATE.md',
        source_truth_finding: 'Convergence depends on name overlap',
        required_closure_update: 'Update CURRENT_STATE.md and append one new SESSION_HISTORY receipt.',
        allowed_file_patterns: ['CURRENT_STATE.md', 'SESSION_HISTORY.md'],
      });
      writeFileSync(
        join(repoDir, 'SESSION_HISTORY.md'),
        `## 2026-05-10 - Prior seam
- Files changed: changed
- Verification: pass
`,
      );
      execSync('git add SESSION_HISTORY.md', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('invalid_contract');
      expect(result.message).toContain('SESSION_HISTORY.md');
      expect(result.message).toContain('append-only');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows append-only SESSION_HISTORY receipts', () => {
    const { repoDir } = makeRepo();
    try {
      writeFileSync(
        join(repoDir, 'SESSION_HISTORY.md'),
        `## 2026-05-10 - Prior seam
- Files changed: none
- Verification: pass
`,
      );
      commitAll(repoDir, 'add history');
      const historyBaseCommit = execSync('git rev-parse HEAD', {
        cwd: repoDir,
        encoding: 'utf8',
      }).trim();

      writeContract(repoDir, {
        base_commit: historyBaseCommit,
        generated_contract_id: 'GENERATED-CURRENT-STATE-CLOSURE',
        source_truth_file: 'CURRENT_STATE.md',
        source_truth_finding: 'Convergence depends on name overlap',
        required_closure_update: 'Update CURRENT_STATE.md and append one new SESSION_HISTORY receipt.',
        allowed_file_patterns: ['CURRENT_STATE.md', 'SESSION_HISTORY.md'],
      });
      writeFileSync(
        join(repoDir, 'SESSION_HISTORY.md'),
        `## 2026-05-10 - Prior seam
- Files changed: none
- Verification: pass

## 2026-05-11 - Closure receipt
- Files changed: CURRENT_STATE.md
- Verification: pass
`,
      );
      execSync('git add SESSION_HISTORY.md', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.touchedFiles).toEqual(['SESSION_HISTORY.md']);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows exact file paths and simple backlog globs', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
        is_user_facing: true,
        browser_proof_command:
          'npx playwright test tests/e2e/public-routes.spec.ts --grep "controller contract"',
        allowed_file_patterns: [
          'scripts/controller-autopilot.ts',
          'lib/briefing/__tests__/*',
        ],
      });
      mkdirSync(join(repoDir, 'scripts'), { recursive: true });
      mkdirSync(join(repoDir, 'lib/briefing/__tests__'), { recursive: true });
      writeFileSync(join(repoDir, 'scripts/controller-autopilot.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'lib/briefing/__tests__/gate.test.ts'), 'export {}\n');
      execSync('git add scripts/controller-autopilot.ts lib/briefing/__tests__/gate.test.ts', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.touchedFiles).toEqual([
        'lib/briefing/__tests__/gate.test.ts',
        'scripts/controller-autopilot.ts',
      ]);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('normalizes only path-shaped backlog entries into enforceable patterns', () => {
    expect(
      normalizeContractFilePatterns(
        '`scripts/controller-autopilot.ts`, `lib/briefing/__tests__/*`, fixture/test files only when safe, auth/session',
      ),
    ).toEqual(['scripts/controller-autopilot.ts', 'lib/briefing/__tests__/*']);
  });
});
