import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSourceTruthCheck } from '@/scripts/source-truth-check';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_NORTH_STAR_LOCK.md',
  'FOLDERA_PRODUCT_OPERATING_SYSTEM.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md',
  '.github/pull_request_template.md',
  '.foldera-contract.json',
];

const tempRoots: string[] = [];

function createFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foldera-source-truth-'));
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

describe('source truth command gate', () => {
  it('passes when issue #168 is active and issue #166 is closed out', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Active implementation seam is issue #168');
    expect(handoff).toContain('Issue #166 / PR #167 completed Repo Intake Governor Command OS v0.');
    expect(handoff).toContain('comments are not law');
    expect(buildOrder).toContain('active_issue: 168');
    expect(buildOrder).toContain('priority_class: COMMAND_OS_AUTO_CAPTURE');
    expect(buildOrder).toContain('comments_are_not_law: true');
    expect(contract.active).toBe(true);
    expect(contract.active_issue).toBe(168);
    expect(contract.authority_status).toBe('ACTIVE_COMMAND_OS_AUTO_CAPTURE');
    expect(failures).toEqual([]);
  });

  it('fails when ACTIVE_HANDOFF.md still points at completed issue #166', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md', original.replace('Active implementation seam is issue #168', 'Active implementation seam is issue #166'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must assign active issue #168; found 166.');
  });

  it('fails when FOLDERA_BUILD_ORDER.yaml still has issue #166 active', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('active_issue: 168', 'active_issue: 166'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue must be 168; found 166.');
  });

  it('fails when .foldera-contract.json is not active for issue #168', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    contract.active = false;
    contract.active_issue = null;
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json active_issue must be 168; found none.');
    expect(failures).toContain('.foldera-contract.json active must be true for issue #168.');
  });

  it('fails when comments are treated as law', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md', original.replace('proves comments are not law', 'treats comments as law'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: comments are not law');
  });

  it('fails when Open Threads is treated as implementation authority', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original.replace('Open Threads issue #165 is the raw-input inbox, not implementation authority.', 'Open Threads issue #165 authorizes implementation.'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: Open Threads issue #165 is the raw-input inbox, not implementation authority.');
  });

  it('fails when the source-truth map stops classifying issue #168 as current control', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'docs/SOURCE_OF_TRUTH_MAP.md');
    writeFixtureFile(
      fixtureRoot,
      'docs/SOURCE_OF_TRUTH_MAP.md',
      original.replace('GitHub issue #168 `Command OS v1 - automatic Open Threads capture from ChatGPT`', 'GitHub issue #168 `stale reference`'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: GitHub issue #168 `Command OS v1 - automatic Open Threads capture from ChatGPT`');
  });
});
