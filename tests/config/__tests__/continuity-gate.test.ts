import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runContinuityGate } from '@/scripts/continuity-gate';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_LAUNCH_ROADMAP.md',
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
  'docs/RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT.md',
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
  it('passes when issue #175 is active as the Rung 2 read-only audit seam', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');

    const failures = runContinuityGate(fixtureRoot);

    expect(handoff).toContain('Active implementation seam is issue #175');
    expect(handoff).toContain('Issue #165 Open Threads remains capture-only and cannot authorize implementation.');
    expect(buildOrder).toContain('active_issue: 175');
    expect(buildOrder).toContain('priority_class: RUNG_2_SCHEMA_EVIDENCE_LANE_AUDIT');
    expect(buildOrder).toContain('next_seam: Rung 3 - Prove deterministic one-verdict fixture loop');
    expect(failures).toEqual([]);
  });

  it('fails when the Product Operating System artifact is removed', () => {
    const fixtureRoot = createFixtureRoot();
    fs.rmSync(path.join(fixtureRoot, 'FOLDERA_PRODUCT_OPERATING_SYSTEM.md'));

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('Missing required source-truth file: FOLDERA_PRODUCT_OPERATING_SYSTEM.md');
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

  it('fails when the mandatory Codex run ledger closeout rule is removed from AGENTS.md', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'AGENTS.md');
    writeFixtureFile(
      fixtureRoot,
      'AGENTS.md',
      original.replace('## MANDATORY CODEX RUN LEDGER CLOSEOUT', '## Optional Codex Run Ledger Closeout'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('AGENTS.md is missing required Codex run ledger rule: ## MANDATORY CODEX RUN LEDGER CLOSEOUT');
  });

  it('fails when the PR template stops requiring North Star traceability', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('North Star traceability for product/business/UX/runtime direction', 'Direction traceability'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('.github/pull_request_template.md must require North Star traceability when direction is implicated.');
  });

  it('fails when the PR template stops requiring Product Operating System traceability', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('- `FOLDERA_PRODUCT_OPERATING_SYSTEM.md`: cited / updated / unchanged - reason / not applicable - reason', ''),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('.github/pull_request_template.md must include the Product Operating System traceability row.');
  });

  it('fails when the source map stops classifying Product Operating System as current control', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'docs/SOURCE_OF_TRUTH_MAP.md');
    writeFixtureFile(
      fixtureRoot,
      'docs/SOURCE_OF_TRUTH_MAP.md',
      original.replace('| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `CURRENT_CONTROL` |', '| `FOLDERA_PRODUCT_OPERATING_SYSTEM.md` | `REFERENCE_ONLY` |'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('docs/SOURCE_OF_TRUTH_MAP.md must classify FOLDERA_PRODUCT_OPERATING_SYSTEM.md as CURRENT_CONTROL.');
  });
});
