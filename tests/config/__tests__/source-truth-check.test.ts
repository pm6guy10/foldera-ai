import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSourceTruthCheck } from '@/scripts/source-truth-check';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
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
  it('fails when FOLDERA_BUILD_ORDER.yaml disagrees with ACTIVE_HANDOFF.md', () => {
    const fixtureRoot = createFixtureRoot();
    const buildOrderPath = path.join(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const original = fs.readFileSync(buildOrderPath, 'utf8');
    writeFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml', original.replace('active_issue: 136', 'active_issue: 121'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_BUILD_ORDER.yaml active_issue must be 136; found 121.');
    expect(failures).toContain('ACTIVE_HANDOFF.md and FOLDERA_BUILD_ORDER.yaml disagree: #136 vs #121.');
  });

  it('fails when .foldera-contract.json resolves to the wrong active issue', () => {
    const fixtureRoot = createFixtureRoot();
    const contractPath = path.join(fixtureRoot, '.foldera-contract.json');
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as Record<string, unknown>;
    contract.active_issue = 121;
    contract.backlog_id = 'ISSUE_121_LANDING_PAGE_FRONTEND_CONTRACT';
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json active_issue must be 136; found 121.');
    expect(failures).toContain('.foldera-contract.json backlog_id must resolve to issue #136; found ISSUE_121_LANDING_PAGE_FRONTEND_CONTRACT.');
  });

  it('fails when protected Vercel preview links are used as proof in controlling files', () => {
    const fixtureRoot = createFixtureRoot();
    const handoffPath = path.join(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const original = fs.readFileSync(handoffPath, 'utf8');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      `${original}\n\nProof: https://foldera-ai-git-issue-123-source-truth.vercel.app\n`,
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('Protected Vercel preview links must not be treated as proof text in controlling files.');
  });
});
