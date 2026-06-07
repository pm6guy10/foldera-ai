import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSourceTruthCheck } from '@/scripts/source-truth-check';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
  'FOLDERA_MASTER_BIBLE.md',
  'FOLDERA_EXECUTION_QUEUE.yaml',
  'FOLDERA_PRODUCT_SPEC_NEXT.md',
  'FOLDERA_GITHUB_ISSUE_PR_PLAN.md',
  'FOLDERA_OPERATING_DOCTRINE.md',
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
  it('passes when the global execution-rule seam is active and the queue remains inactive', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const queue = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');
    const productSpec = readFixtureFile(fixtureRoot, 'FOLDERA_PRODUCT_SPEC_NEXT.md');
    const issuePlan = readFixtureFile(fixtureRoot, 'FOLDERA_GITHUB_ISSUE_PR_PLAN.md');

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Issue #181 is completed by merged PR #191.');
    expect(handoff).toContain('Issue #192 is completed by merged PR #193.');
    expect(handoff).toContain('Issue #196 is completed by merged PR #197.');
    expect(handoff).toContain('Issue #198 is completed by merged PR #198 and restored issue #194 as active control.');
    expect(handoff).toContain('Issue #194 is completed by merged PR #201.');
    expect(handoff).toContain('Issue #178 is the active Command OS Merge Clerk v0 governance seam.');
    expect(handoff).toContain('The active seam is the Command OS Merge Clerk v0 governance seam:');
    expect(handoff).toContain('Issue #165 Open Threads remains capture-only and cannot authorize implementation.');
    expect(handoff).toContain('Issue #182 is completed/superseded by PR #203.');
    expect(handoff).toContain('Issue #168 is completed/superseded by PR #205.');
    expect(handoff).toContain('The next authorized move after this closeout is to continue issue #178 in the active seam.');
    expect(handoff).toContain('`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.');
    expect(buildOrder).toContain('active_issue: 178');
    expect(buildOrder).toContain('priority_class: GLOBAL_RULE_ENFORCEMENT');
    expect(buildOrder).toContain('work_type: GOVERNANCE_ENFORCEMENT');
    expect(buildOrder).toContain('next_seam: issue #178 Command OS Merge Clerk v0 governance seam - reason highest-priority open product/infrastructure issue after issue #140 closeout');
    expect(buildOrder).toContain('MERGED_AND_CLOSED');
    expect(buildOrder).toContain('BLOCKED_WITH_EXACT_RECEIPT');
    expect(queue).toContain('- id: "005"');
    expect(queue).toContain('status: COMPLETED');
    expect(queue).toContain('- id: "006"');
    expect(queue).toContain('status: QUEUED');
    expect(queue).toContain('authority: REFERENCE_ONLY');
    expect(queue).toContain('routing_mode: REFERENCE_ONLY');
    expect(productSpec).toContain('## Locked Revenue Ladder');
    expect(productSpec).toContain('`#194` verdict loop proof');
    expect(productSpec).toContain('money-ready MVP proof');
    expect(issuePlan).toContain('## Locked Revenue Ladder');
    expect(issuePlan).toContain('Prove money-ready MVP end to end');
    expect(issuePlan).toContain('Prove first non-owner validation');
    expect(failures).toEqual([]);
  });

  it('fails when Task 006 is started early', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml', original.replace('    status: QUEUED', '    status: ACTIVE'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_EXECUTION_QUEUE.yaml task 006 must remain QUEUED.');
    expect(failures).toContain('FOLDERA_EXECUTION_QUEUE.yaml must have zero ACTIVE tasks while the governance patch is active; found 1.');
  });

  it('fails when the queue still claims supreme authority', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');
    writeFixtureFile(
      fixtureRoot,
      'FOLDERA_EXECUTION_QUEUE.yaml',
      original
        .replace('authority: REFERENCE_ONLY', 'authority: SUPREME_EXECUTION_QUEUE')
        .replace(
          'authority_law: This queue is historical archaeology only and does not override ACTIVE_HANDOFF.md, FOLDERA_BUILD_ORDER.yaml, or docs/SOURCE_OF_TRUTH_MAP.md.',
          'authority_law: FOLDERA_EXECUTION_QUEUE.yaml overrides every other markdown source-truth file for execution routing.',
        )
        .replace('routing_mode: REFERENCE_ONLY', 'routing_mode: DETERMINISTIC_EXECUTION')
        .replace(
          'queue_update_law: Future queue activation requires an explicit activation issue; this file does not control current execution.',
          'queue_update_law: Agents may not deviate from this queue without a signed-off QUEUE_UPDATE commit from Brandon.',
        )
        .replace(
          'Treat this file as reference-only unless a future explicit activation issue reauthorizes it.',
          'Read this file first for execution routing.',
        )
        .replace(
          'Read ACTIVE_HANDOFF.md and FOLDERA_BUILD_ORDER.yaml first for current execution.',
          'Identify the first ACTIVE task.',
        )
        .replace(
          'Do not advance tasks, infer active work, or mutate this file as live control.',
          'Execute only that task.',
        )
        .replace(
          'The task list is retained for archaeology only.',
          'When proof passes, mark it COMPLETED, move the next QUEUED task to ACTIVE, and continue.',
        )
        .replace(
          'Historical queue artifact; issue #194 now controls the first money-loop implementation seam.',
          'Do not ask what is next.',
        ),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain(
      'FOLDERA_EXECUTION_QUEUE.yaml is missing required reference-only marker: authority: REFERENCE_ONLY',
    );
    expect(failures).toContain(
      'FOLDERA_EXECUTION_QUEUE.yaml still contains stale queue-authority marker: authority: SUPREME_EXECUTION_QUEUE',
    );
  });

  it('fails when ACTIVE_HANDOFF.md still claims queue control', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original
        .replace('Issue #178 is the active Command OS Merge Clerk v0 governance seam.', 'Issue #194 is the active first money-loop implementation seam.')
        .replace('Issue #168 is completed/superseded by PR #205.', 'Issue #194 is the active first money-loop implementation seam.'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: Issue #168 is completed/superseded by PR #205.');
    expect(failures).toContain('ACTIVE_HANDOFF.md active seam issue must be #178; found #194.');
  });

  it('fails when .foldera-contract.json no longer reflects the global-rule contract', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    contract.active = false;
    contract.active_issue = 194;
    contract.backlog_id = 'FOLDERA_MASTER_BIBLE_FIRST_MONEY_LOOP';
    contract.authority_status = 'MASTER_BIBLE_FIRST_MONEY_LOOP_ACTIVE';
    contract.terminal_state_authority = { allowed: ['BLOCKED', 'PROOF'], merge_through_rule: 'Merge when it feels right.' };
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json must remain active while it governs the global execution-rule patch.');
    expect(failures).toContain('.foldera-contract.json must expose GLOBAL_RULE_ENFORCEMENT_ACTIVE authority status.');
    expect(failures).toContain('.foldera-contract.json must point at FOLDERA_GLOBAL_RULE_ENFORCEMENT backlog_id.');
    expect(failures).toContain('.foldera-contract.json active_issue must be 178; found 194.');
    expect(failures).toContain('.foldera-contract.json is missing terminal state authority for MERGED_AND_CLOSED.');
    expect(failures).toContain('.foldera-contract.json must expose a machine-readable merge-through rule.');
  });
});
