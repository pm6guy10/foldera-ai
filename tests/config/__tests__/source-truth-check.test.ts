import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSourceTruthCheck } from '@/scripts/source-truth-check';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_NORTH_STAR_LOCK.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  '.github/pull_request_template.md',
  '.foldera-contract.json',
  'AGENTS.md',
  '.github/workflows/pr-sentinel.yml',
  'package.json',
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
  it('passes only when issue #159 Growth Scout is active and PR #142 remains parked', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = fs.readFileSync(path.join(fixtureRoot, 'ACTIVE_HANDOFF.md'), 'utf8');
    const buildOrder = fs.readFileSync(path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml'), 'utf8');
    const contract = JSON.parse(fs.readFileSync(path.join(fixtureRoot, '.foldera-contract.json'), 'utf8')) as Record<string, unknown>;

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Active implementation seam is issue #159');
    expect(handoff).toContain('Issue #156 is complete: PR #158 created `FOLDERA_NORTH_STAR_LOCK.md` as CURRENT_CONTROL');
    expect(handoff).toContain('Issue #154 is complete/blocked as a selection seam');
    expect(handoff).toContain('Issue #151 is complete: PR #153 landed the source-backed Right Now selector');
    expect(handoff).toContain('Issue #140 / PR #142 remains rail-only and parked externally blocked');
    expect(buildOrder).toContain('active_issue: 159');
    expect(buildOrder).toContain('work_type: SOURCE_TRUTH_GROWTH_EVIDENCE_TRACKER');
    expect(buildOrder).toContain('required_issue_159_growth_scout');
    expect(contract.active_issue).toBe(159);
    expect(failures).toEqual([]);
  });

  it('fails when the North Star Lock artifact is missing', () => {
    const fixtureRoot = createFixtureRoot();
    fs.rmSync(path.join(fixtureRoot, 'FOLDERA_NORTH_STAR_LOCK.md'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('Missing required file: FOLDERA_NORTH_STAR_LOCK.md');
  });

  it('fails when future PR traceability stops citing the North Star Lock', () => {
    const fixtureRoot = createFixtureRoot();
    const templatePath = path.join(fixtureRoot, '.github/pull_request_template.md');
    const original = fs.readFileSync(templatePath, 'utf8');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('- `FOLDERA_NORTH_STAR_LOCK.md`: cited / updated / unchanged - reason / not applicable - reason', ''),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.github/pull_request_template.md must include the North Star traceability row.');
  });

  it('fails when FOLDERA_BUILD_ORDER.yaml still commands issue #140', () => {
    const fixtureRoot = createFixtureRoot();
    const buildOrderPath = path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const original = fs.readFileSync(buildOrderPath, 'utf8');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('active_issue: 159', 'active_issue: 140'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue must be 159; found 140.');
  });

  it('fails when .foldera-contract.json still resolves to issue #140', () => {
    const fixtureRoot = createFixtureRoot();
    const contractPath = path.join(fixtureRoot, '.foldera-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as Record<string, unknown>;
    contract.active_issue = 140;
    contract.backlog_id = 'ISSUE_140_REAL_SLACK_SELF_LOOP_LIVE_RAIL_PROOF';
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json active_issue must be 159; found 140.');
    expect(failures).toContain('.foldera-contract.json backlog_id must resolve to issue #159 Foldera Growth Scout.');
  });

  it('fails when the issue #151 completion merge SHA is removed', () => {
    const fixtureRoot = createFixtureRoot();
    const buildOrderPath = path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const original = fs.readFileSync(buildOrderPath, 'utf8');
    writeFixtureFile(
      fixtureRoot,
      'FOLDERA_BUILD_ORDER.yaml',
      original.replace('merge_sha: be5d596c8033f9b273ceb025aa3c2c18333520f4', 'merge_sha: missing'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml must record issue #151 / PR #153 completed with merge SHA.');
  });

  it('fails when closed issue carry-forward status is removed', () => {
    const fixtureRoot = createFixtureRoot();
    const buildOrderPath = path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const original = fs.readFileSync(buildOrderPath, 'utf8');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('status: closed_superseded', 'status: open'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml must classify issue #121 as closed/completed/superseded.');
  });
});
