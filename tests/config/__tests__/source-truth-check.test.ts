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
  it('passes when issue #166 is active and Open Threads remains capture-only', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    const packageJson = JSON.parse(readFixtureFile(fixtureRoot, 'package.json')) as { scripts?: Record<string, string> };

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Active implementation seam is issue #166');
    expect(handoff).toContain('Issue #163 / PR #164 completed the Product Operating System.');
    expect(handoff).toContain('Open Threads issue #165 is the raw-input inbox, not implementation authority.');
    expect(buildOrder).toContain('active_issue: 166');
    expect(buildOrder).toContain('priority_class: REPO_INTAKE_GOVERNOR_COMMAND_OS');
    expect(buildOrder).toContain("next_seam: Run Repo Intake Governor against Brandon's next messy Foldera input");
    expect(contract.active).toBe(true);
    expect(contract.active_issue).toBe(166);
    expect(contract.authority_status).toBe('ACTIVE_REPO_INTAKE_GOVERNOR_COMMAND_OS');
    expect(contract.allowed_file_patterns).toContain('lib/repo-intake-governor/**');
    expect(contract.allowed_file_patterns).toContain('tests/fixtures/repo-intake-governor/**');
    expect(packageJson.scripts?.['governor:intake']).toBe('npx tsx scripts/repo-intake-governor.ts');
    expect(packageJson.scripts?.['gate:repo-intake-governor']).toContain('tests/repo-intake-governor');
    expect(failures).toEqual([]);
  });

  it('fails when the Product Operating System artifact is missing', () => {
    const fixtureRoot = createFixtureRoot();
    fs.rmSync(path.join(fixtureRoot, 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('Missing required file: FOLDERA_PRODUCT_OPERATING_SYSTEM.md');
  });

  it('fails when the Product Operating System stops naming Repo Intake Governor v0', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md');
    writeFixtureFile(fixtureRoot, 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md', original.replace(/Repo Intake Governor v0/g, 'Manual evidence collection'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_PRODUCT_OPERATING_SYSTEM.md is missing required marker: Repo Intake Governor v0');
  });

  it('fails when ACTIVE_HANDOFF.md still points at completed issue #163', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md', original.replace('Active implementation seam is issue #166', 'Active implementation seam is issue #163'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must assign active issue #166; found 163.');
  });

  it('fails when FOLDERA_BUILD_ORDER.yaml is still in the issue #163 Product Operating System state', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('active_issue: 166', 'active_issue: 163'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue must be 166; found 163.');
  });

  it('fails when .foldera-contract.json is not active for issue #166', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    contract.active = false;
    contract.active_issue = null;
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json active_issue must be 166; found none.');
    expect(failures).toContain('.foldera-contract.json active must be true for issue #166.');
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

  it('fails when the Command OS implementation files are not authorized', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as { allowed_file_patterns?: string[] };
    contract.allowed_file_patterns = contract.allowed_file_patterns?.filter((entry) => entry !== 'lib/repo-intake-governor/**');
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json allowed_file_patterns must include: lib/repo-intake-governor/**');
  });

  it('fails when the Repo Intake Governor gate script is missing', () => {
    const fixtureRoot = createFixtureRoot();
    const packageJson = JSON.parse(readFixtureFile(fixtureRoot, 'package.json')) as { scripts?: Record<string, string> };
    if (packageJson.scripts) delete packageJson.scripts['gate:repo-intake-governor'];
    writeFixtureFile(fixtureRoot, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('package.json must define scripts.gate:repo-intake-governor for Command OS proof.');
  });

  it('fails when the source-truth map stops classifying the Product Operating System as current control', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'docs/SOURCE_OF_TRUTH_MAP.md');
    writeFixtureFile(
      fixtureRoot,
      'docs/SOURCE_OF_TRUTH_MAP.md',
      original.replace('| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |', '| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `REFERENCE_ONLY` |'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('docs/SOURCE_OF_TRUTH_MAP.md is missing required marker: | `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |');
  });

  it('fails when the PR template stops requiring Product Operating System traceability', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`: cited / updated / unchanged - reason / not applicable - reason', ''),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.github/pull_request_template.md must include the Product Operating System traceability row.');
  });

  it('fails when ACTIVE_HANDOFF.md returns to the manual-first-10-only command', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      `${original}\nThe only safe next move is manual evidence collection/recording inside docs/growth/FIRST_10_ICP_EVIDENCE_TRACKER.md.\n`,
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md still contains stale manual-first-10-only command: The only safe next move is manual evidence collection/recording');
  });
});
