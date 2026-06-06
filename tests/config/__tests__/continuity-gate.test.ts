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
  it('passes when the handoff points at the global-rule seam', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const prTemplate = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');

    const failures = runContinuityGate(fixtureRoot);

    expect(handoff).toContain('Issue #182 is the active global execution-rule enforcement seam.');
    expect(handoff).toContain('The active seam is the GitHub Operating System rule-enforcement patch:');
    expect(handoff).toContain('Issue #165 Open Threads remains capture-only and cannot authorize implementation.');
    expect(handoff).toContain('Issue #168 is the future automatic ChatGPT-to-GitHub switchboard seam.');
    expect(handoff).toContain('The next authorized move after this closeout is issue #168 in a separate run.');
    expect(buildOrder).toContain('active_issue: 182');
    expect(buildOrder).toContain('priority_class: GLOBAL_RULE_ENFORCEMENT');
    expect(buildOrder).toContain('work_type: GOVERNANCE_ENFORCEMENT');
    expect(buildOrder).toContain('next_seam: issue #168 automatic Open Threads capture + lessons-learned recurrence enforcement - reason future ChatGPT-to-GitHub switchboard seam after governance enforcement');
    expect(buildOrder).toContain('MERGED_AND_CLOSED');
    expect(buildOrder).toContain('BLOCKED_WITH_EXACT_RECEIPT');
    expect(prTemplate).toContain('## Receipt summary');
    expect(prTemplate).toContain('Active issue:');
    expect(prTemplate).toContain('Next authorized move:');
    expect(prTemplate).toContain('Forbidden work touched: YES/NO');
    expect(prTemplate).toContain('Proof run:');
    expect(prTemplate).toContain('Checks passed: YES/NO');
    expect(prTemplate).toContain('Merge-through status:');
    expect(prTemplate).toContain('Terminal state: MERGED_AND_CLOSED / BLOCKED_WITH_EXACT_RECEIPT / HUMAN_REVIEW_REQUIRED_WITH_REASON / STOPPED_WITH_AUTHORIZED_REASON');
    expect(prTemplate).toContain('Local hook status:');
    expect(prTemplate).toContain('If bypassed, exact unrelated-route explanation:');
    expect(prTemplate).toContain('Source-truth closeout status:');
    expect(prTemplate).toContain('Stop condition:');
    expect(prTemplate).toContain('Merge/closeout completed or why not:');
    expect(prTemplate).toContain('## Global rule enforcement');
    expect(prTemplate).toContain('Source truth first:');
    expect(prTemplate).toContain('One active seam only:');
    expect(prTemplate).toContain('No chat-only law:');
    expect(prTemplate).toContain('Merge-through completion law:');
    expect(prTemplate).toContain('Forbidden surface law:');
    expect(failures).toEqual([]);
  });

  it('fails when the active seam line is removed', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original.replace('Issue #182 is the active global execution-rule enforcement seam.', 'Issue #194 is the active first money-loop implementation seam.'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md active seam issue #194 must match FOLDERA_BUILD_ORDER.yaml active_issue #182.');
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
      original.replace('Terminal state: MERGED_AND_CLOSED / BLOCKED_WITH_EXACT_RECEIPT / HUMAN_REVIEW_REQUIRED_WITH_REASON / STOPPED_WITH_AUTHORIZED_REASON', 'Terminal state:'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain(
      '.github/pull_request_template.md must declare the allowed terminal state set in the receipt summary.',
    );
  });

  it('fails when the global rule enforcement section is removed', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('## Global rule enforcement', '## Global rule capture'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain('.github/pull_request_template.md must include a global rule enforcement section.');
  });

  it('fails when the bypass explanation is removed from the receipt summary', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, '.github/pull_request_template.md');
    writeFixtureFile(
      fixtureRoot,
      '.github/pull_request_template.md',
      original.replace('- If bypassed, exact unrelated-route explanation:', '- If bypassed, explanation:'),
    );

    const failures = runContinuityGate(fixtureRoot);

    expect(failures).toContain(
      '.github/pull_request_template.md must require an exact unrelated-route explanation when a local hook is bypassed.',
    );
  });
});
