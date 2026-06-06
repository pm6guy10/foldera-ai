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
  it('passes when the handoff points at the closeout state', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const prTemplate = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');

    const failures = runContinuityGate(fixtureRoot);

    expect(handoff).toContain('Issue #194 is completed by merged PR #201.');
    expect(handoff).toContain('No active implementation seam remains after PR #201.');
    expect(handoff).toContain('The next authorized move is durable response/state/receipt loop.');
    expect(buildOrder).toContain('active_issue: null');
    expect(buildOrder).toContain('priority_class: NEXT_AUTHORIZED_RUNG');
    expect(buildOrder).toContain('work_type: SOURCE_TRUTH_CLOSEOUT');
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
        .replace('No active implementation seam remains after PR #201.', 'Active implementation seam is issue #194.'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must not name an active issue after PR #201 closeout; found issue #194.');
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
