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

function overwriteFile(root: string, relativeFile: string, body: string): void {
  fs.writeFileSync(path.join(root, relativeFile), body, 'utf8');
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
  it('fails when the mandatory writeback rule is removed from ACTIVE_HANDOFF.md', () => {
    const fixtureRoot = createFixtureRoot();
    const handoffPath = path.join(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const original = fs.readFileSync(handoffPath, 'utf8');
    fs.writeFileSync(
      handoffPath,
      original.replace('GitHub writeback before stop is mandatory.', 'GitHub writeback before stop is optional.'),
      'utf8',
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain(
      'ACTIVE_HANDOFF.md is missing required GitHub writeback rule: GitHub writeback before stop is mandatory.',
    );
  });

  it('fails when a completed issue remains active in handoff, build order, and contract', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = fs.readFileSync(path.join(fixtureRoot, 'ACTIVE_HANDOFF.md'), 'utf8');
    const buildOrder = fs.readFileSync(path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml'), 'utf8');
    const contract = JSON.parse(fs.readFileSync(path.join(fixtureRoot, '.foldera-contract.json'), 'utf8')) as { backlog_id: string };

    overwriteFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      handoff.replace('Active implementation seam is issue #121 (landing page frontend contract + code-native LP repair).', 'Active implementation seam is issue #120 (public funnel route contract).'),
    );
    overwriteFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', buildOrder.replace('active_issue: 121', 'active_issue: 120'));
    overwriteFile(
      fixtureRoot,
      '.foldera-contract.json',
      `${JSON.stringify({ ...contract, backlog_id: 'ISSUE_120_PUBLIC_FUNNEL_ROUTE_CONTRACT' }, null, 2)}\n`,
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain(
      'ACTIVE_HANDOFF.md active seam issue #120 is listed as completed in FOLDERA_BUILD_ORDER.yaml and must be rolled forward or marked BLOCKED.',
    );
    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue #120 is listed as completed and must be rolled forward or marked BLOCKED.');
    expect(failures).toContain('.foldera-contract.json backlog issue #120 is listed as completed in FOLDERA_BUILD_ORDER.yaml and must be rolled forward.');
  });

  it('fails when the current contract issue drifts away from the active source-truth issue', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(fs.readFileSync(path.join(fixtureRoot, '.foldera-contract.json'), 'utf8')) as { backlog_id: string };
    overwriteFile(
      fixtureRoot,
      '.foldera-contract.json',
      `${JSON.stringify({ ...contract, backlog_id: 'ISSUE_120_PUBLIC_FUNNEL_ROUTE_CONTRACT' }, null, 2)}\n`,
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json backlog issue #120 must match ACTIVE_HANDOFF.md active seam issue #121.');
    expect(failures).toContain('.foldera-contract.json backlog issue #120 must match FOLDERA_BUILD_ORDER.yaml active_issue #121.');
  });
});
