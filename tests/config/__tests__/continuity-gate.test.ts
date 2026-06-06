import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runContinuityGate } from '@/scripts/continuity-gate';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_LAUNCH_ROADMAP.md',
  'FOLDERA_OPERATING_DOCTRINE.md',
  'FOLDERA_OPERATING_SYSTEM.md',
  'FOLDERA_NORTH_STAR_LOCK.md',
  'FOLDERA_PRODUCT_OPERATING_SYSTEM.md',
  'CODEX_START.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GPT.md',
  'SYSTEM_RUNBOOK.md',
  'ACCEPTANCE_GATE.md',
  'README.md',
  'package.json',
  'WHATS_NEXT.md',
  'FOLDERA_SHIP_SPEC.md',
  'FOLDERA_PRODUCT_SPEC.md',
  'FOLDERA_PRODUCTION_BACKLOG.md',
  'FOLDERA_MASTER_AUDIT.md',
  '.foldera-contract.json',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'dot-cursorrules.fixture',
  'cursor-agent.fixture',
  '.github/pull_request_template.md',
  '.github/workflows/pr-sentinel.yml',
];

const tempRoots: string[] = [];

function createFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foldera-continuity-'));
  tempRoots.push(root);

  for (const relativeFile of requiredFixtureFiles) {
    const sourceFile = relativeFile === 'dot-cursorrules.fixture' ? '.cursorrules' : relativeFile === 'cursor-agent.fixture' ? '.cursor/rules/agent.mdc' : relativeFile;
    const destinationFile = sourceFile;
    const source = path.join(process.cwd(), sourceFile);
    const destination = path.join(root, destinationFile);
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
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('continuity gate writeback enforcement', () => {
  it('passes when the handoff points at the implementation seam', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const prTemplate = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');

    const failures = runContinuityGate(fixtureRoot);

    expect(handoff).toContain('Issue #196 is completed by merged PR #197.');
    expect(handoff).toContain('Active implementation seam is issue #194.');
    expect(handoff).toContain('The active seam is the first money-loop issue:');
    expect(buildOrder).toContain('active_issue: 194');
    expect(buildOrder).toContain('priority_class: FIRST_MONEY_LOOP');
    expect(buildOrder).toContain('FOLDERA_PRODUCT_SPEC_NEXT.md');
    expect(buildOrder).toContain('FOLDERA_GITHUB_ISSUE_PR_PLAN.md');
    expect(prTemplate).toContain('## Receipt summary');
    expect(prTemplate).toContain('Active issue:');
    expect(prTemplate).toContain('Next authorized move:');
    expect(prTemplate).toContain('Forbidden work touched: YES/NO');
    expect(prTemplate).toContain('Proof run:');
    expect(prTemplate).toContain('Source-truth closeout status:');
    expect(prTemplate).toContain('Stop condition:');
    expect(failures).toEqual([]);
  });

  it('fails when the active seam line is removed', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original
        .replace('Issue #196 is completed by merged PR #197.', 'Issue #196 is now the active source-truth cleanup seam.')
        .replace('Active implementation seam is issue #194.', 'Queue control is implied but unnamed.')
        .replace('The active seam is the first money-loop issue: `Prove sources become signals, signals become context, and context becomes one next move`.', 'The active seam is the root source-truth archive/delete sweep: `Root source-truth archive/delete sweep`.'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must name exactly one active seam line; found 0.');
    expect(failures).toContain('ACTIVE_HANDOFF.md active seam issue number could not be parsed.');
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

    expect(failures).toContain(
      'ACTIVE_HANDOFF.md is missing required GitHub writeback rule: GitHub writeback before stop is mandatory.',
    );
  });

  it('fails when the pull request template stops requiring the receipt summary fields', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('Active issue:', 'Issue routed:'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain(
      '.github/pull_request_template.md must declare the active issue in the receipt summary.',
    );
  });
});
