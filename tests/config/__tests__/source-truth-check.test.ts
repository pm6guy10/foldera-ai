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
  it('passes when the Master Bible closeout is active and the queue remains inactive', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const queue = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Issue #181 is completed by merged PR #191.');
    expect(handoff).toContain('Active implementation seam is issue #192.');
    expect(handoff).toContain('`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.');
    expect(buildOrder).toContain('active_issue: 192');
    expect(buildOrder).toContain('priority_class: MASTER_BIBLE_CLOSEOUT');
    expect(buildOrder).toContain('work_type: SOURCE_TRUTH_CLOSEOUT');
    expect(queue).toContain('- id: "005"');
    expect(queue).toContain('status: COMPLETED');
    expect(queue).toContain('- id: "006"');
    expect(queue).toContain('status: QUEUED');
    expect(failures).toEqual([]);
  });

  it('fails when Task 006 is started early', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml', original.replace('    status: QUEUED', '    status: ACTIVE'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_EXECUTION_QUEUE.yaml task 006 must remain QUEUED.');
    expect(failures).toContain('FOLDERA_EXECUTION_QUEUE.yaml must have zero ACTIVE tasks in PR #192; found 1.');
  });

  it('fails when ACTIVE_HANDOFF.md still claims queue control', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original
        .replace('Active implementation seam is issue #192.', 'Active implementation seam is `EXECUTION_QUEUE`.')
        .replace('`FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.', 'The active seam is now controlled entirely by `FOLDERA_EXECUTION_QUEUE.yaml`.')
        .replace('`FOLDERA_EXECUTION_QUEUE.yaml` remains inactive and does not control the next move.', 'Task `006` remains queued.')
        .replace('PR #189 remains `UNMERGED_DRAFT_CONTEXT_ONLY`.', 'No Task `006` work has started in this PR.')
        .replace('Issue #140 / PR #142 remains rail-only and parked outside this source-truth closeout seam.', 'PR #183 is a source-truth and gate-alignment seam only.'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: Active implementation seam is issue #192.');
    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: `FOLDERA_MASTER_BIBLE.md` is the canonical master bible reference authority.');
    expect(failures).toContain('ACTIVE_HANDOFF.md still contains stale queue-progress marker: Active implementation seam is `EXECUTION_QUEUE`.');
  });

  it('ignores stale .foldera-contract.json queue authority fields', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    contract.active = true;
    contract.active_issue = 999;
    contract.backlog_id = 'FOLDERA_EXECUTION_QUEUE';
    contract.authority_status = 'DETERMINISTIC_EXECUTION_QUEUE_ACTIVE';
    contract.acceptance_condition = 'FOLDERA_EXECUTION_QUEUE.yaml remains present as a reference artifact while the Master Bible closeout is active.';
    contract.next_command = 'Keep the queue inactive until a future explicit activation issue says otherwise.';
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toEqual([]);
  });
});
