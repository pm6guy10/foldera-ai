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
  'FOLDERA_MASTER_SYNTHESIS_DRAFT.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
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
  it('passes when issue #170 is active and the Master Synthesis draft is reference-only', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Active implementation seam is issue #170');
    expect(handoff).toContain('Issue #166 / PR #167 completed the Repo Intake Governor Command OS v0');
    expect(handoff).toContain('Issue #165 Open Threads remains capture-only and cannot authorize implementation.');
    expect(buildOrder).toContain('active_issue: 170');
    expect(buildOrder).toContain('priority_class: MASTER_SYNTHESIS_BUILD_BIBLE_LOCK');
    expect(buildOrder).toContain('work_type: SOURCE_TRUTH_BUILD_DEFINITION');
    expect(contract.active).toBe(true);
    expect(contract.active_issue).toBe(170);
    expect(contract.authority_status).toBe('ACTIVE_MASTER_SYNTHESIS_REFERENCE_DRAFT_LOCK');
    expect(contract.allowed_file_patterns).toContain('FOLDERA_MASTER_SYNTHESIS_DRAFT.md');
    expect(failures).toEqual([]);
  });

  it('fails when the Master Synthesis draft is missing', () => {
    const fixtureRoot = createFixtureRoot();
    fs.rmSync(path.join(fixtureRoot, 'FOLDERA_MASTER_SYNTHESIS_DRAFT.md'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('Missing required file: FOLDERA_MASTER_SYNTHESIS_DRAFT.md');
  });

  it('fails when ACTIVE_HANDOFF.md still points at completed issue #166', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md', original.replace('Active implementation seam is issue #170', 'Active implementation seam is issue #166'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must assign active issue #170; found 166.');
  });

  it('fails when FOLDERA_BUILD_ORDER.yaml is still active for issue #166', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('active_issue: 170', 'active_issue: 166'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue must be 170; found 166.');
  });

  it('fails when .foldera-contract.json is not active for issue #170', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    contract.active = false;
    contract.active_issue = null;
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json active_issue must be 170; found none.');
    expect(failures).toContain('.foldera-contract.json active must be true for issue #170.');
  });

  it('fails when Open Threads is treated as implementation authority', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original.replace('Issue #165 Open Threads remains capture-only and cannot authorize implementation.', 'Issue #165 Open Threads authorizes implementation.'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: Issue #165 Open Threads remains capture-only and cannot authorize implementation.');
  });

  it('fails when the draft loses its not-build-ready verdict', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_MASTER_SYNTHESIS_DRAFT.md');
    writeFixtureFile(fixtureRoot, 'FOLDERA_MASTER_SYNTHESIS_DRAFT.md', original.replace('# READINESS VERDICT - NOT BUILD-READY YET', '# READINESS VERDICT - BUILD READY'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_MASTER_SYNTHESIS_DRAFT.md is missing required marker: # READINESS VERDICT - NOT BUILD-READY YET');
  });

  it('fails when the source map stops classifying the draft as REFERENCE_DRAFT', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'docs/SOURCE_OF_TRUTH_MAP.md');
    writeFixtureFile(
      fixtureRoot,
      'docs/SOURCE_OF_TRUTH_MAP.md',
      original.replace('| `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `REFERENCE_DRAFT` |', '| `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `CURRENT_CONTROL` |'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: | `FOLDERA_MASTER_SYNTHESIS_DRAFT.md` | `REFERENCE_DRAFT` |');
  });

  it('fails when .foldera-contract.json authorizes product files', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as { allowed_file_patterns?: string[] };
    contract.allowed_file_patterns?.push('app/**');
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json allowed_file_patterns must not include forbidden entry: app/**');
  });

  it('fails when completed issue #166 is no longer classified as completed or superseded', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    writeFixtureFile(
      fixtureRoot,
      'FOLDERA_BUILD_ORDER.yaml',
      original
        .replace('completed/superseded as active source truth', 'active again as source truth')
        .replace('status: completed_superseded', 'status: active_again')
        .replace('completed by PR #167 and is no longer active', 'reactivated by PR #167'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml must classify issue #166 as completed_superseded because PR #167 merged.');
  });
});
