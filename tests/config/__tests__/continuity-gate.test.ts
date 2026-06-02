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

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('continuity gate writeback enforcement', () => {
  it('passes when issue #156 is explicitly assigned as the North Star Lock seam', () => {
    const fixtureRoot = createFixtureRoot();

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toEqual([]);
  });

  it('fails when the active issue #156 seam is removed', () => {
    const fixtureRoot = createFixtureRoot();
    const handoffPath = path.join(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const original = fs.readFileSync(handoffPath, 'utf8');
    fs.writeFileSync(
      handoffPath,
      original.replace(
        'Active implementation seam is issue #156: Foldera North Star Lock.',
        'No active implementation seam is assigned.',
      ),
      'utf8',
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md must name exactly one active seam line; found 0.');
  });

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

  it('fails when the mandatory Codex run ledger closeout rule is removed from AGENTS.md', () => {
    const fixtureRoot = createFixtureRoot();
    const agentsPath = path.join(fixtureRoot, 'AGENTS.md');
    const original = fs.readFileSync(agentsPath, 'utf8');
    fs.writeFileSync(
      agentsPath,
      original.replace('## MANDATORY CODEX RUN LEDGER CLOSEOUT', '## Optional Codex Run Ledger Closeout'),
      'utf8',
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('AGENTS.md is missing required Codex run ledger rule: ## MANDATORY CODEX RUN LEDGER CLOSEOUT');
  });
});

