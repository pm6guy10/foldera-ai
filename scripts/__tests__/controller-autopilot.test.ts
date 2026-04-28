import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyDirtyEntries,
  findFirstOpenBacklogItem,
  findWaitingExternalQuotaBacklogItems,
  findWaitingPassiveProofBacklogItems,
  parseBacklogItems,
  parseSessionHistoryEntries,
  runControllerAutopilot,
} from '../controller-autopilot';

describe('controller-autopilot backlog parsing', () => {
  it('skips WAITING_PASSIVE_PROOF items and selects the first later OPEN backlog item', () => {
    const items = parseBacklogItems(`
### BL-001
ID: BL-001
Title: Closed seam
Status: CLOSED

### BL-011
ID: BL-011
Rung: 1
Title: Waiting seam
User-facing path: Daily-send path
Required local proof: npm run build
Required production proof: passive send proof
Status: WAITING_PASSIVE_PROOF
Next blocker: next normal daily-send proof required

### BL-099
ID: BL-099
Title: Later open seam
Status: OPEN
`);

    const firstOpen = findFirstOpenBacklogItem(items);
    const waitingItems = findWaitingPassiveProofBacklogItems(items);

    expect(firstOpen?.id).toBe('BL-099');
    expect(firstOpen?.title).toBe('Later open seam');
    expect(waitingItems.map((item) => item.id)).toEqual(['BL-011']);
    expect(waitingItems[0]?.nextBlocker).toBe('next normal daily-send proof required');
  });

  it('still reports waiting passive-proof items separately from actionable work', () => {
    const items = parseBacklogItems(`
### BL-011
ID: BL-011
Title: Waiting seam
Status: WAITING_PASSIVE_PROOF
Next blocker: next normal daily-send proof required

### BL-003
ID: BL-003
Title: Actionable seam
Status: OPEN
`);

    const waitingItems = findWaitingPassiveProofBacklogItems(items);

    expect(waitingItems).toHaveLength(1);
    expect(waitingItems[0]).toMatchObject({
      id: 'BL-011',
      status: 'WAITING_PASSIVE_PROOF',
      nextBlocker: 'next normal daily-send proof required',
    });
  });

  it('skips WAITING_EXTERNAL_QUOTA items and selects the first later OPEN backlog item', () => {
    const items = parseBacklogItems(`
### BL-003
ID: BL-003
Title: External quota blocked seam
Status: WAITING_EXTERNAL_QUOTA
Next blocker: Paid model quota reset/access required before fresh owner interview-class paid production proof can run.

### BL-011
ID: BL-011
Title: Waiting passive seam
Status: WAITING_PASSIVE_PROOF
Next blocker: next normal daily-send proof required

### BL-004
ID: BL-004
Title: First actionable seam
Status: OPEN
`);

    const firstOpen = findFirstOpenBacklogItem(items);
    const waitingPassive = findWaitingPassiveProofBacklogItems(items);
    const waitingExternal = findWaitingExternalQuotaBacklogItems(items);

    expect(firstOpen?.id).toBe('BL-004');
    expect(waitingPassive.map((item) => item.id)).toEqual(['BL-011']);
    expect(waitingExternal.map((item) => item.id)).toEqual(['BL-003']);
  });

  it('keeps existing OPEN behavior when no waiting passive-proof item exists', () => {
    const items = parseBacklogItems(`
### BL-003
ID: BL-003
Rung: 2
Title: First open seam
Status: OPEN

### BL-004
ID: BL-004
Title: Later open seam
Status: OPEN
`);

    const firstOpen = findFirstOpenBacklogItem(items);
    const waitingItems = findWaitingPassiveProofBacklogItems(items);

    expect(firstOpen?.id).toBe('BL-003');
    expect(firstOpen?.title).toBe('First open seam');
    expect(firstOpen?.rung).toBe('2');
    expect(waitingItems).toEqual([]);
  });
});

describe('controller-autopilot stop behavior', () => {
  it('returns STOP when no actionable OPEN item exists (waiting/blocked only)', () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });

    const repoDir = mkdtempSync(join(tmpdir(), 'controller-autopilot-'));
    try {
      execSync('git init', { cwd: repoDir, stdio: 'ignore' });
      writeFileSync(
        join(repoDir, 'FOLDERA_PRODUCTION_BACKLOG.md'),
        `
### BL-011
ID: BL-011
Status: WAITING_PASSIVE_PROOF
Next blocker: next normal daily-send proof required

### BL-003
ID: BL-003
Status: WAITING_EXTERNAL_QUOTA
Next blocker: quota reset pending
`,
      );
      writeFileSync(
        join(repoDir, 'ACCEPTANCE_GATE.md'),
        'If Codex cannot prove that at least one production rung advanced, the run did not count.',
      );
      writeFileSync(
        join(repoDir, 'SESSION_HISTORY.md'),
        '## 2026-04-28 — Session\n- Files changed: none\n- Verification: none\n',
      );

      const code = runControllerAutopilot(repoDir);

      expect(code).toBe(1);
      expect(logs.some((line) => line.includes('CONTROLLER RESULT: STOP'))).toBe(true);
      expect(
        logs.some((line) =>
          line.includes(
            'HARD STOP REASON: No actionable OPEN backlog item found; all remaining backlog items are waiting or blocked.',
          ),
        ),
      ).toBe(true);
      expect(logs.some((line) => line.includes('WAITING PASSIVE PROOF ITEMS:'))).toBe(true);
      expect(logs.some((line) => line.includes('WAITING EXTERNAL BLOCKER ITEMS:'))).toBe(true);
    } finally {
      spy.mockRestore();
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

describe('controller-autopilot dirty-file classification', () => {
  it('allows controller-owned files and safe generated artifacts but blocks unrelated source changes', () => {
    const result = classifyDirtyEntries([
      {
        status: 'M',
        path: 'package.json',
        raw: ' M package.json',
      },
      {
        status: '??',
        path: 'scripts/controller-autopilot.ts',
        raw: '?? scripts/controller-autopilot.ts',
      },
      {
        status: '??',
        path: 'playwright-report/index.html',
        raw: '?? playwright-report/index.html',
      },
      {
        status: 'M',
        path: 'app/dashboard/page.tsx',
        raw: ' M app/dashboard/page.tsx',
      },
    ]);

    expect(result.controllerOwned.map((entry) => entry.path)).toEqual([
      'package.json',
      'scripts/controller-autopilot.ts',
    ]);
    expect(result.safeGenerated.map((entry) => entry.path)).toEqual([
      'playwright-report/index.html',
    ]);
    expect(result.blocking.map((entry) => entry.path)).toEqual([
      'app/dashboard/page.tsx',
    ]);
  });
});

describe('controller-autopilot session history parsing', () => {
  it('keeps the latest heading summaries parseable', () => {
    const entries = parseSessionHistoryEntries(`
## 2026-04-27 — First seam
- Files changed: A
- Verification: pass

## 2026-04-27 — Second seam
- Files changed: B
- Verification: pass
`);

    expect(entries).toHaveLength(2);
    expect(entries.at(-1)?.heading).toBe('2026-04-27 — Second seam');
    expect(entries.at(-1)?.summaryLines).toEqual([
      '- Files changed: B',
      '- Verification: pass',
    ]);
  });
});
