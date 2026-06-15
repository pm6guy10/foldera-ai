import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findForbiddenClaimFailures,
  runContinuityGate,
  validateActiveSeamPullRequest,
  validateContractFileDiff,
  validatePullRequestReceipt,
  MAX_ROOT_MARKDOWN_FILES,
} from '@/scripts/continuity-gate';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'ACTIVE_SEAM_STATE.json',
  'AGENTS.md',
  'CLAUDE.md',
  'FOLDERA_MASTER_BIBLE.md',
  'README.md',
  'SESSION_HISTORY.md',
  'LESSONS_LEARNED.md',
  'FOLDERA_BUILD_ORDER.yaml',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'package.json',
  '.github/pull_request_template.md',
  '.github/workflows/pr-sentinel.yml',
];

const tempRoots: string[] = [];

function createFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foldera-continuity-'));
  tempRoots.push(root);
  for (const relativeFile of requiredFixtureFiles) {
    const source = path.join(process.cwd(), relativeFile);
    const destination = path.join(root, relativeFile);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return root;
}

function readFixtureFile(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function writeFixtureFile(root: string, file: string, body: string): void {
  const destination = path.join(root, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, body, 'utf8');
}

function currentFixtureLedger(root: string): { active_issue?: number; active_branch?: string | null } {
  return JSON.parse(readFixtureFile(root, 'ACTIVE_SEAM_STATE.json')) as {
    active_issue?: number;
    active_branch?: string | null;
  };
}

function currentFixtureBuildOrderIssue(root: string): number | null {
  const match = readFixtureFile(root, 'FOLDERA_BUILD_ORDER.yaml').match(/^active_issue:\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : null;
}

afterEach(() => {
  delete process.env.GITHUB_HEAD_REF;
  delete process.env.GITHUB_EVENT_PATH;
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('continuity gate', () => {
  it('passes against the real repo source-truth files', () => {
    const fixtureRoot = createFixtureRoot();
    expect(runContinuityGate(fixtureRoot)).toEqual([]);
  });

  it('fails when a second active seam is declared', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      `${original}\nIssue #194 is the active first money-loop implementation seam.`,
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must name exactly one active seam line; found 2.');
  });

  it('fails when the active seam ledger disagrees with the active issue', () => {
    const fixtureRoot = createFixtureRoot();
    const ledger = currentFixtureLedger(fixtureRoot);
    const buildOrderIssue = currentFixtureBuildOrderIssue(fixtureRoot);
    ledger.active_issue = 9999;
    writeFixtureFile(fixtureRoot, 'ACTIVE_SEAM_STATE.json', `${JSON.stringify(ledger, null, 2)}\n`);

    const failures = runContinuityGate(fixtureRoot);

    expect(
      failures.some((failure) =>
        failure.includes(
          `ACTIVE_SEAM_STATE.json active_issue #9999 must match FOLDERA_BUILD_ORDER.yaml active_issue #${buildOrderIssue}`,
        ),
      ),
    ).toBe(true);
  });

  it('fails when the active seam ledger disagrees with the pull request head branch', () => {
    const fixtureRoot = createFixtureRoot();
    const ledger = currentFixtureLedger(fixtureRoot);
    fs.mkdirSync(path.join(fixtureRoot, '.git'));
    process.env.GITHUB_HEAD_REF = 'other-branch';

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain(
      `ACTIVE_SEAM_STATE.json active_branch "${ledger.active_branch}" must match current branch "other-branch".`,
    );
  });

  it('does not require active_branch to match main or merge queue refs', () => {
    const fixtureRoot = createFixtureRoot();
    fs.mkdirSync(path.join(fixtureRoot, '.git'));

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toEqual([]);
  });

  it('passes active_branch mismatch for a governance-contract-only PR (AGENTS.md only, no seam-state files)', () => {
    const fixtureRoot = createFixtureRoot();
    fs.mkdirSync(path.join(fixtureRoot, '.git'));
    process.env.GITHUB_HEAD_REF = 'claude/some-governance-branch';

    const failures = runContinuityGate(fixtureRoot, {
      changedFiles: ['AGENTS.md'],
      issueStateFetcher: () => 'skip',
    });

    expect(failures.every((f) => !f.includes('active_branch'))).toBe(true);
  });

  it('fails active_branch mismatch when product/code files are included in changed files', () => {
    const fixtureRoot = createFixtureRoot();
    fs.mkdirSync(path.join(fixtureRoot, '.git'));
    process.env.GITHUB_HEAD_REF = 'feature/some-product-branch';

    const failures = runContinuityGate(fixtureRoot, {
      changedFiles: ['AGENTS.md', 'app/components/Foo.tsx'],
      issueStateFetcher: () => 'skip',
    });

    expect(failures.some((f) => f.includes('active_branch'))).toBe(true);
  });

  it('fails active_branch mismatch when ACTIVE_SEAM_STATE.json is among changed files', () => {
    const fixtureRoot = createFixtureRoot();
    fs.mkdirSync(path.join(fixtureRoot, '.git'));
    process.env.GITHUB_HEAD_REF = 'claude/some-governance-branch';

    const failures = runContinuityGate(fixtureRoot, {
      changedFiles: ['AGENTS.md', 'ACTIVE_SEAM_STATE.json'],
      issueStateFetcher: () => 'skip',
    });

    expect(failures.some((f) => f.includes('active_branch'))).toBe(true);
  });

  it('fails when handoff and build order disagree on the active issue', () => {
    const fixtureRoot = createFixtureRoot();
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', buildOrder.replace(/^active_issue:\s*\d+\s*$/m, 'active_issue: 9999'));

    const failures = runContinuityGate(fixtureRoot);

    expect(failures.some((failure) => failure.includes('must match FOLDERA_BUILD_ORDER.yaml active_issue #9999'))).toBe(true);
  });

  it('fails when the root grows a new governance markdown file', () => {
    const fixtureRoot = createFixtureRoot();
    const currentCount = fs.readdirSync(fixtureRoot).filter((name) => name.toLowerCase().endsWith('.md')).length;
    for (let index = 0; index <= MAX_ROOT_MARKDOWN_FILES - currentCount; index += 1) {
      writeFixtureFile(fixtureRoot, `NEW_GOVERNANCE_RULE_${index}.md`, '# A new rule file that should not exist\n');
    }

    const failures = runContinuityGate(fixtureRoot);

    expect(failures.some((failure) => failure.includes(`maximum is ${MAX_ROOT_MARKDOWN_FILES}`))).toBe(true);
  });

  it('fails when the mandatory writeback rule is removed from ACTIVE_HANDOFF.md', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original.replace('GitHub writeback before stop is mandatory.', 'GitHub writeback before stop is optional.'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: GitHub writeback before stop is mandatory.');
  });

  it('fails when the PR template drops the source-truth closeout section', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('## Source-truth closeout', '## Closeout'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('.github/pull_request_template.md must include Source-truth closeout section.');
  });

  it('fails when the live issue-state fetcher reports the active issue is CLOSED', () => {
    const fixtureRoot = createFixtureRoot();

    const failures = runContinuityGate(fixtureRoot, { issueStateFetcher: () => 'closed' });

    expect(failures.some((f) => f.includes('is CLOSED on GitHub'))).toBe(true);
  });

  it('passes when the live issue-state fetcher is skipped (no auth token)', () => {
    const fixtureRoot = createFixtureRoot();

    const failures = runContinuityGate(fixtureRoot, { issueStateFetcher: () => 'skip' });

    expect(failures).toEqual([]);
  });

  it('fails when a pull request changes a file outside the active contract allowlist', () => {
    const fixtureRoot = createFixtureRoot();
    const failures = validateContractFileDiff(fixtureRoot, [
      'ACTIVE_HANDOFF.md',
      'app/api/auth/session/route.ts',
    ]);

    expect(failures).toContain(
      'Forbidden file change: app/api/auth/session/route.ts matches .foldera-contract.json forbidden_file_patterns.',
    );
  });

  it('fails when a pull request changes a file that is neither explicitly allowed nor workflow-governance scoped', () => {
    const fixtureRoot = createFixtureRoot();
    const failures = validateContractFileDiff(fixtureRoot, ['README.md']);

    expect(failures).toContain(
      'Unauthorized file change: README.md is not allowed by .foldera-contract.json allowed_file_patterns.',
    );
  });

  it('fails when required closeout receipt rows are incomplete', () => {
    const failures = validatePullRequestReceipt(`
## Source-truth closeout
- \`ACTIVE_HANDOFF.md\`: updated
- \`ACTIVE_SEAM_STATE.json\`: unchanged
- \`FOLDERA_BUILD_ORDER.yaml\`: unchanged - reason
- \`.foldera-contract.json\`: not applicable - reason
- \`docs/SOURCE_OF_TRUTH_MAP.md\`: unchanged - reason
## Next seam
named
`);

    expect(failures).toContain(
      'PR receipt row for ACTIVE_SEAM_STATE.json must be one of: updated, unchanged - reason, not applicable - reason.',
    );
  });

  it('passes a complete closeout receipt', () => {
    const failures = validatePullRequestReceipt(`
## Source-truth closeout
- \`ACTIVE_HANDOFF.md\`: updated
- \`ACTIVE_SEAM_STATE.json\`: updated
- \`FOLDERA_BUILD_ORDER.yaml\`: updated
- \`.foldera-contract.json\`: updated
- \`docs/SOURCE_OF_TRUTH_MAP.md\`: unchanged - reason
- Run Ledger ID: abc123def
## Next seam
blocked - reason
`);

    expect(failures).toEqual([]);
  });

  it('fails when a pull request targets a non-active issue', () => {
    const fixtureRoot = createFixtureRoot();
    const activeIssue = currentFixtureBuildOrderIssue(fixtureRoot);
    const failures = validateActiveSeamPullRequest(fixtureRoot, {
      title: 'Issue #999: unrelated cleanup',
      body: 'Closes #999',
      branch: 'codex/issue-999-cleanup',
    });

    expect(failures).toContain(
      `Active-seam protection failed: PR targets issue #999 but FOLDERA_BUILD_ORDER.yaml active_issue is #${activeIssue}.`,
    );
  });

  it('passes when a pull request targets the active issue', () => {
    const fixtureRoot = createFixtureRoot();
    const activeIssue = currentFixtureBuildOrderIssue(fixtureRoot);
    const failures = validateActiveSeamPullRequest(fixtureRoot, {
      title: `Issue #${activeIssue}: some feature`,
      body: `Closes #${activeIssue}`,
      branch: `feature/issue-${activeIssue}`,
    });

    expect(failures).toEqual([]);
  });

  it('fails when public-facing copy plants a forbidden claim', () => {
    const fixtureRoot = createFixtureRoot();
    writeFixtureFile(fixtureRoot, 'app/landing/page.tsx', 'export default "SOC 2 compliance-ready";\n');

    const failures = findForbiddenClaimFailures(fixtureRoot);

    expect(failures.some((failure) => failure.includes('app/landing/page.tsx'))).toBe(true);
    expect(failures.some((failure) => failure.includes('SOC 2'))).toBe(true);
    expect(failures.some((failure) => failure.includes('compliance-ready'))).toBe(true);
  });
});
