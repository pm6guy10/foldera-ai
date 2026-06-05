import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSourceTruthCheck } from '@/scripts/source-truth-check';

const requiredFixtureFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_BUILD_ORDER.yaml',
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
  it('passes when queue authority is active and Task 006 remains queued', () => {
    const fixtureRoot = createFixtureRoot();
    const handoff = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    const buildOrder = readFixtureFile(fixtureRoot, 'FOLDERA_BUILD_ORDER.yaml');
    const queue = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(handoff).toContain('Active implementation seam is `EXECUTION_QUEUE`.');
    expect(handoff).toContain('Tasks `001`-`005` are completed.');
    expect(handoff).toContain('Task `006` remains queued.');
    expect(buildOrder).toContain('active_issue: 183');
    expect(buildOrder).toContain('priority_class: DETERMINISTIC_EXECUTION_QUEUE');
    expect(buildOrder).toContain('queued_next_task: "006"');
    expect(queue).toContain('- id: "005"');
    expect(queue).toContain('status: COMPLETED');
    expect(queue).toContain('- id: "006"');
    expect(queue).toContain('status: QUEUED');
    expect(contract.active).toBe(true);
    expect(contract.active_issue).toBeNull();
    expect(contract.authority_status).toBe('DETERMINISTIC_EXECUTION_QUEUE_ACTIVE');
    expect(failures).toEqual([]);
  });

  it('fails when Task 006 is started early', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml');
    writeFixtureFile(fixtureRoot, 'FOLDERA_EXECUTION_QUEUE.yaml', original.replace('    status: QUEUED', '    status: ACTIVE'));

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('FOLDERA_EXECUTION_QUEUE.yaml task 006 must remain QUEUED.');
    expect(failures).toContain('FOLDERA_EXECUTION_QUEUE.yaml must have zero ACTIVE tasks in PR #183; found 1.');
  });

  it('fails when ACTIVE_HANDOFF.md still claims Task 002 is active', () => {
    const fixtureRoot = createFixtureRoot();
    const original = readFixtureFile(fixtureRoot, 'ACTIVE_HANDOFF.md');
    writeFixtureFile(
      fixtureRoot,
      'ACTIVE_HANDOFF.md',
      original
        .replace('Tasks `001`-`005` are completed.', 'Task `001` is completed and Task `002` is active.')
        .replace('Task `006` remains queued.', 'Task `002` is active.')
        .replace('No Task `006` work has started in this PR.', 'Read `FOLDERA_EXECUTION_QUEUE.yaml`, execute active Task `002`, and advance the queue only if its proof gate passes.'),
    );

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: Tasks `001`-`005` are completed.');
    expect(failures).toContain('ACTIVE_HANDOFF.md is missing required marker: Task `006` remains queued.');
    expect(failures).toContain('ACTIVE_HANDOFF.md still contains stale queue-progress marker: Task `001` is completed and Task `002` is active.');
  });

  it('fails when .foldera-contract.json still points to the old first-active-task contract', () => {
    const fixtureRoot = createFixtureRoot();
    const contract = JSON.parse(readFixtureFile(fixtureRoot, '.foldera-contract.json')) as Record<string, unknown>;
    contract.acceptance_condition = 'FOLDERA_EXECUTION_QUEUE.yaml exists, contains 20-30 granular build steps for the Holy Crap MVP loop, and item 001 is ACTIVE.';
    contract.next_command = 'Read FOLDERA_EXECUTION_QUEUE.yaml, execute the first ACTIVE task, and do not ask what is next.';
    writeFixtureFile(fixtureRoot, '.foldera-contract.json', `${JSON.stringify(contract, null, 2)}\n`);

    const failures = runSourceTruthCheck(fixtureRoot);

    expect(failures).toContain('.foldera-contract.json acceptance_condition is missing: Tasks 001-005 are COMPLETED');
    expect(failures).toContain('.foldera-contract.json next_command must preserve the Task 006 stop boundary.');
  });
});
