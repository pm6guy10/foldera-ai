import { describe, expect, it } from 'vitest';

import {
  classifyDirtyEntries,
  findFirstOpenBacklogItem,
  parseBacklogItems,
  parseSessionHistoryEntries,
} from '../controller-autopilot';

describe('controller-autopilot backlog parsing', () => {
  it('selects the first OPEN backlog item in file order', () => {
    const items = parseBacklogItems(`
### BL-001
ID: BL-001
Title: Closed seam
Status: CLOSED

### BL-011
ID: BL-011
Rung: 1
Title: First open seam
User-facing path: Daily-send path
Required local proof: npm run build
Required production proof: passive send proof
Status: OPEN

### BL-099
ID: BL-099
Title: Later open seam
Status: OPEN
`);

    const firstOpen = findFirstOpenBacklogItem(items);

    expect(firstOpen?.id).toBe('BL-011');
    expect(firstOpen?.title).toBe('First open seam');
    expect(firstOpen?.rung).toBe('1');
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
