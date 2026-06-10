import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runContinuityGate, MAX_ROOT_MARKDOWN_FILES } from '@/scripts/continuity-gate';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
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
  fs.writeFileSync(path.join(root, file), body, 'utf8');
}

afterEach(() => {
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
});
