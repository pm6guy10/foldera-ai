import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import {
  classifyDirtyEntries,
  findFirstActionableBacklogItem,
  findWaitingExternalBlockerBacklogItems,
  findWaitingExternalQuotaBacklogItems,
  findWaitingPassiveProofBacklogItems,
  getBacklogEligibility,
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

    const firstOpen = findFirstActionableBacklogItem(items);
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

    const firstOpen = findFirstActionableBacklogItem(items);
    const waitingPassive = findWaitingPassiveProofBacklogItems(items);
    const waitingExternal = findWaitingExternalQuotaBacklogItems(items);

    expect(firstOpen?.id).toBe('BL-004');
    expect(waitingPassive.map((item) => item.id)).toEqual(['BL-011']);
    expect(waitingExternal.map((item) => item.id)).toEqual(['BL-003']);
  });

  it('skips external account/proof blockers and selects the first actionable OPEN item', () => {
    const items = parseBacklogItems(`
### BL-006
ID: BL-006
Title: Missing real non-owner account
Status: WAITING_EXTERNAL_ACCOUNT
Next blocker: Provision and connect one real non-owner user with live auth and token rows.

### BL-015
ID: BL-015
Title: External proof blocked seam
Status: WAITING_EXTERNAL_PROOF
Next blocker: External product data proof required.

### BL-007
ID: BL-007
Title: First actionable seam
Status: OPEN
`);

    const firstOpen = findFirstActionableBacklogItem(items);
    const waitingExternal = findWaitingExternalBlockerBacklogItems(items);

    expect(firstOpen?.id).toBe('BL-007');
    expect(waitingExternal.map((item) => item.id)).toEqual(['BL-006', 'BL-015']);
    expect(waitingExternal.map((item) => item.status)).toEqual([
      'WAITING_EXTERNAL_ACCOUNT',
      'WAITING_EXTERNAL_PROOF',
    ]);
  });

  it('skips OPEN items whose next blocker is external/proof-only and selects the first actionable OPEN item', () => {
    const items = parseBacklogItems(`
### BL-021
ID: BL-021
Title: Open but quota-blocked
Status: OPEN
Next blocker: Paid model quota reset/access required before fresh production proof can run.

### BL-022
ID: BL-022
Title: Open but missing real account
Status: OPEN
Next blocker: Provision and connect one real non-owner user with live auth and token rows.

### BL-023
ID: BL-023
Title: Open but passive proof only
Status: OPEN
Next blocker: next normal daily-send proof required

### BL-025
ID: BL-025
Title: Open but no current repro
Status: OPEN
Next blocker: No current failing seam to repair; health gate is passing.

### BL-024
ID: BL-024
Title: Actionable seam
Status: OPEN
Next blocker: Trace the code path and add deterministic regression coverage.
`);

    const firstActionable = findFirstActionableBacklogItem(items);
    const eligibility = items.map(getBacklogEligibility);

    expect(firstActionable?.id).toBe('BL-024');
    expect(eligibility.slice(0, 4).map((item) => item.reason)).toEqual([
      'blocked by quota',
      'blocked by missing connected account',
      'blocked by passive next-window proof',
      'no current failing seam to repair',
    ]);
    expect(eligibility[4]?.actionable).toBe(true);
  });

  it('skips OPEN items whose next blocker requires paid live Generate Now proof', () => {
    const items = parseBacklogItems(`
### BL-015
ID: BL-015
Title: Owner money-shot artifact
Status: OPEN
Next blocker: Complete one live owner Generate Now proof after external model capacity returns and explicit paid-proof approval is available.

### BL-016
ID: BL-016
Title: Paid/model-backed proof wording
Status: OPEN
Next blocker: paid/model-backed proof required before this item can close.

### BL-017
ID: BL-017
Title: Actionable seam
Status: OPEN
Next blocker: Trace the local code path and add deterministic regression coverage.
`);

    const firstActionable = findFirstActionableBacklogItem(items);
    const eligibility = items.map(getBacklogEligibility);

    expect(firstActionable?.id).toBe('BL-017');
    expect(eligibility[0]).toMatchObject({
      actionable: false,
      reason: 'blocked by paid/model-backed proof',
    });
    expect(eligibility[1]).toMatchObject({
      actionable: false,
      reason: 'blocked by paid/model-backed proof',
    });
  });

  it('skips the universal waiting status set without hardcoded backlog IDs', () => {
    const items = parseBacklogItems(`
### BL-101
ID: BL-101
Status: WAITING_PAID_PROOF

### BL-102
ID: BL-102
Status: WAITING_MANUAL_AUTH

### BL-103
ID: BL-103
Status: WAITING_REAL_USER

### BL-104
ID: BL-104
Status: WAITING_TIME_WINDOW

### BL-105
ID: BL-105
Status: OPEN
Next blocker: Current code seam can be tested locally.
`);

    const firstActionable = findFirstActionableBacklogItem(items);
    const waitingExternal = findWaitingExternalBlockerBacklogItems(items);

    expect(firstActionable?.id).toBe('BL-105');
    expect(waitingExternal.map((item) => item.id)).toEqual([
      'BL-101',
      'BL-102',
      'BL-103',
      'BL-104',
    ]);
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

    const firstOpen = findFirstActionableBacklogItem(items);
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

### BL-006
ID: BL-006
Status: WAITING_EXTERNAL_ACCOUNT
Next blocker: non-owner account setup pending
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
            'HARD STOP REASON: No actionable backlog item found; all parsed items are waiting, blocked, closed, missing status, or missing a current code/proof seam.',
          ),
        ),
      ).toBe(true);
      expect(logs.some((line) => line.includes('SKIPPED NON-ACTIONABLE ITEMS:'))).toBe(
        true,
      );
      expect(
        logs.some((line) =>
          line.includes(
            'BL-006 | status=WAITING_EXTERNAL_ACCOUNT | reason=requires unavailable external account setup',
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
