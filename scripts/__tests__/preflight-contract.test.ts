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

function writeValidActiveHandoff(repoDir: string, currentSlice: string) {
  writeFileSync(
    join(repoDir, 'ACTIVE_HANDOFF.md'),
    `# ACTIVE HANDOFF
Current slice: ${currentSlice}

## Next exact move

1. Continue the verified controller path.
`,
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

  it('allows a staged STOP cleanup to remove a stale contract', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/preflight-contract.ts'],
      });
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'old\n');
      writeFileSync(join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'), 'old\n');
      writeValidActiveHandoff(repoDir, 'old seam state');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), 'old\n');
      commitAll(repoDir, 'contract');

      rmSync(join(repoDir, '.foldera-contract.json'));
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'new\n');
      writeFileSync(join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'), 'new\n');
      writeValidActiveHandoff(repoDir, 'stop cleanup');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), 'new\n');
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toContain('.foldera-contract.json');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows a committed STOP cleanup without a contract during pre-push', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['scripts/preflight-contract.ts'],
      });
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'old\n');
      writeFileSync(join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'), 'old\n');
      writeValidActiveHandoff(repoDir, 'old seam state');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), 'old\n');
      commitAll(repoDir, 'contract');

      rmSync(join(repoDir, '.foldera-contract.json'));
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'new\n');
      writeFileSync(join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'), 'new\n');
      writeValidActiveHandoff(repoDir, 'stop cleanup');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), 'new\n');
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
      writeValidActiveHandoff(repoDir, 'receipt follow-up');
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining([
          'ACTIVE_HANDOFF.md',
          'scripts/preflight-contract.ts',
        ]),
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

      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      writeValidActiveHandoff(repoDir, 'receipt cleanup');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), 'receipt\n');
      commitAll(repoDir, 'receipt cleanup');

      const result = validateContractForStage(repoDir, 'pre-push');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining(['ACTIVE_HANDOFF.md', 'docs/archive/SESSION_HISTORY.md']),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows release-gate controller files without a product contract', () => {
    const { repoDir } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      mkdirSync(join(repoDir, 'lib', 'config'), { recursive: true });
      mkdirSync(join(repoDir, 'lib', 'cron', '__tests__'), { recursive: true });
      mkdirSync(join(repoDir, 'lib', 'ops'), { recursive: true });
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeValidActiveHandoff(repoDir, 'release gate status controller');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), '## Receipt\n- release gate\n');
      writeFileSync(join(repoDir, 'package.json'), '{"scripts":{"gate:status":"tsx scripts/release-gate-status.ts"}}\n');
      writeFileSync(join(repoDir, 'docs', 'RELEASE_GATES.md'), '# Release gates\n');
      writeFileSync(join(repoDir, 'docs', 'REAL_NON_OWNER_BETA_PROOF_CHECKLIST.md'), '# Beta proof\n');
      writeFileSync(join(repoDir, 'docs', 'OWNER_CANARY_TEST_RUNBOOK.md'), '# Canary\n');
      writeFileSync(join(repoDir, 'lib', 'config', 'constants.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'lib', 'cron', 'acceptance-gate.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'lib', 'cron', '__tests__', 'acceptance-gate.test.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'lib', 'ops', 'beta-readiness.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'scripts', 'release-gate-status.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'release-gate-status.test.ts'),
        'export {}\n',
      );
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining([
          'ACTIVE_HANDOFF.md',
          'docs/archive/SESSION_HISTORY.md',
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
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows quality-gate controller files without a product contract', () => {
    const { repoDir } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeValidActiveHandoff(repoDir, 'quality gate status controller');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), '## Receipt\n- quality gate\n');
      writeFileSync(join(repoDir, 'package.json'), '{"scripts":{"gate:quality":"tsx scripts/quality-gate-status.ts"}}\n');
      writeFileSync(join(repoDir, 'docs', 'QUALITY_GATES.md'), '# Quality gates\n');
      writeFileSync(join(repoDir, 'scripts', 'quality-gate-status.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'quality-gate-status.test.ts'),
        'export {}\n',
      );
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'),
        'export {}\n',
      );
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining([
          'ACTIVE_HANDOFF.md',
          'docs/archive/SESSION_HISTORY.md',
          'package.json',
          'docs/QUALITY_GATES.md',
          'scripts/quality-gate-status.ts',
          'scripts/__tests__/quality-gate-status.test.ts',
          'scripts/preflight-contract.ts',
          'scripts/__tests__/preflight-contract.test.ts',
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows decision-trace quality-gate controller files without a product contract', () => {
    const { repoDir } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeValidActiveHandoff(repoDir, 'decision trace quality gate controller');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), '## Receipt\n- decision trace gate\n');
      writeFileSync(join(repoDir, 'package.json'), '{"scripts":{"gate:decision-trace":"tsx scripts/decision-trace-gate-status.ts"}}\n');
      writeFileSync(join(repoDir, 'docs', 'QUALITY_GATES.md'), '# Quality gates\n');
      writeFileSync(join(repoDir, 'scripts', 'decision-trace-gate-status.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'decision-trace-gate-status.test.ts'),
        'export {}\n',
      );
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'),
        'export {}\n',
      );
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining([
          'ACTIVE_HANDOFF.md',
          'docs/archive/SESSION_HISTORY.md',
          'package.json',
          'docs/QUALITY_GATES.md',
          'scripts/decision-trace-gate-status.ts',
          'scripts/__tests__/decision-trace-gate-status.test.ts',
          'scripts/preflight-contract.ts',
          'scripts/__tests__/preflight-contract.test.ts',
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('allows visual-gate controller files without a product contract', () => {
    const { repoDir } = makeRepo();
    try {
      mkdirSync(join(repoDir, 'docs', 'archive'), { recursive: true });
      mkdirSync(join(repoDir, 'tests', 'dashboard'), { recursive: true });
      mkdirSync(join(repoDir, 'tests', 'e2e'), { recursive: true });
      mkdirSync(join(repoDir, 'scripts', '__tests__'), { recursive: true });
      writeValidActiveHandoff(repoDir, 'visual gate status controller');
      writeFileSync(join(repoDir, 'docs', 'archive', 'SESSION_HISTORY.md'), '## Receipt\n- visual gate\n');
      writeFileSync(join(repoDir, 'package.json'), '{"scripts":{"gate:visual":"tsx scripts/visual-gate-status.ts"}}\n');
      writeFileSync(join(repoDir, 'docs', 'QUALITY_GATES.md'), '# Quality gates\n');
      writeFileSync(join(repoDir, 'tests', 'dashboard', 'live-artifact-pixel-lock.spec.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'tests', 'e2e', 'landing-dashboard-visual.spec.ts'), 'export {}\n');
      writeFileSync(join(repoDir, 'scripts', 'visual-gate-status.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'visual-gate-status.test.ts'),
        'export {}\n',
      );
      writeFileSync(join(repoDir, 'scripts', 'preflight-contract.ts'), 'export {}\n');
      writeFileSync(
        join(repoDir, 'scripts', '__tests__', 'preflight-contract.test.ts'),
        'export {}\n',
      );
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(true);
      expect(result.code).toBe('ok');
      expect(result.touchedFiles).toEqual(
        expect.arrayContaining([
          'ACTIVE_HANDOFF.md',
          'docs/archive/SESSION_HISTORY.md',
          'package.json',
          'docs/QUALITY_GATES.md',
          'tests/dashboard/live-artifact-pixel-lock.spec.ts',
          'tests/e2e/landing-dashboard-visual.spec.ts',
          'scripts/visual-gate-status.ts',
          'scripts/__tests__/visual-gate-status.test.ts',
          'scripts/preflight-contract.ts',
          'scripts/__tests__/preflight-contract.test.ts',
        ]),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('rejects an oversized active handoff before it can reach CI', () => {
    const { repoDir, baseCommit } = makeRepo();
    try {
      writeContract(repoDir, {
        base_commit: baseCommit,
        allowed_file_patterns: ['ACTIVE_HANDOFF.md'],
      });
      const oversizedHandoff = [
        '# ACTIVE HANDOFF',
        'Current slice: CI guard',
        '## Next exact move',
        ...Array.from({ length: 78 }, (_, index) => `line ${index + 1}`),
      ].join('\n');
      writeFileSync(join(repoDir, 'ACTIVE_HANDOFF.md'), `${oversizedHandoff}\n`);
      execSync('git add ACTIVE_HANDOFF.md', { cwd: repoDir, stdio: 'ignore' });

      const result = validateContractForStage(repoDir, 'pre-commit');

      expect(result.ok).toBe(false);
      expect(result.code).toBe('invalid_contract');
      expect(result.message).toContain('ACTIVE_HANDOFF.md is 82 lines');
      expect(result.message).toContain('<= 80 lines');
      expect(result.violations).toEqual(['ACTIVE_HANDOFF.md']);
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
