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
  'docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md',
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
  it('passes when issue #159 is complete and next seam is blocked until real first-10 evidence exists', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = fs.readFileSync(path.join(fixtureRoot, 'ACTIVE_HANDOFF.md'), 'utf8');
    const buildOrder = fs.readFileSync(path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml'), 'utf8');
    const contract = JSON.parse(fs.readFileSync(path.join(fixtureRoot, '.foldera-contract.json'), 'utf8')) as Record<string, unknown>;

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('No active implementation seam is assigned.');
    expect(handoff).toContain('Issue #159 is complete: PR #161 created `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`');
    expect(handoff).toContain('Next seam: blocked - reason: no next growth/product seam is authorized until real first-10 ICP evidence exists in `docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md`.');
    expect(handoff).toContain('Issue #156 Foldera North Star Lock is complete on `main` via PR #158');
    expect(handoff).toContain('`FOLDERA_NORTH_STAR_LOCK.md` remains CURRENT_CONTROL');
    expect(handoff).toContain('Issue #140 / PR #142 remains rail-only and parked externally blocked');
    expect(buildOrder).toContain('active_issue: null');
    expect(buildOrder).toContain('priority_class: BLOCKED_NO_ACTION_SAFE');
    expect(buildOrder).toContain('work_type: SOURCE_TRUTH_CLOSEOUT_POST_159');
    expect(buildOrder).toContain('required_issue_159_growth_scout');
    expect(contract.active_issue).toBeNull();
    expect(contract.authority_status).toBe('BLOCKED_NO_ACTION_SAFE_FIRST_10_EVIDENCE');
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

  it('fails when FOLDERA_BUILD_ORDER.yaml still commands an active issue', () => {
    const fixtureRoot = createFixtureRoot();
    const buildOrderPath = path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const original = fs.readFileSync(buildOrderPath, 'utf8');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('active_issue: null', 'active_issue: 159'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue must be null after issue #159 completion; found 159.');
  });

  it('fails when .foldera-contract.json still resolves to active issue #159', () => {
    const fixtureRoot = createFixtureRoot();
    const contractPath = path.join(fixtureRoot, '.foldera-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as Record<string, unknown>;
    contract.active = true;
    contract.active_issue = 159;
    contract.backlog_id = 'ISSUE_159_FOLDERA_GROWTH_SCOUT_FIRST_10_ICP';
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json active_issue must be null after issue #159 completion; found 159.');
    expect(failures).toContain('.foldera-contract.json active must be false while next seam is blocked.');
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
