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
    allowed_file_patterns?: string[];
    forbidden_file_patterns?: string[];
  },
) {
  writeFileSync(
    join(repoDir, '.foldera-contract.json'),
    JSON.stringify(
      {
        backlog_id: 'BL-777',
        base_commit: contract.base_commit,
        allowed_file_patterns: contract.allowed_file_patterns ?? [],
        forbidden_file_patterns: contract.forbidden_file_patterns ?? [],
        required_local_proof: 'npm test',
        required_browser_proof: '',
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

  it('allows exact file paths and simple backlog globs', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
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
