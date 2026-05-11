import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function writeCommonControllerTruthFiles(
  repoDir: string,
  overrides?: {
    activeHandoff?: string;
    currentState?: string;
    sessionHistory?: string;
    acceptanceGate?: string;
  },
) {
  writeFileSync(
    join(repoDir, 'ACTIVE_HANDOFF.md'),
    overrides?.activeHandoff ??
      `# ACTIVE HANDOFF — FOLDERA

Last updated: 2026-05-11 14:00 PT
Current slice: Closed seam
Current mode: Waiting for the next exact seam

## Current product truth

- Health is \`0 FAILING\`; last generation is still historical \`do_nothing\`.

## Verified proof

- health: PASS 2026-05-11 14:00 PT; \`RESULT: 0 FAILING\`

## Remaining defects in current slice

1. This slice is complete.
`,
  );
  writeFileSync(
    join(repoDir, 'CURRENT_STATE.md'),
    overrides?.currentState ??
      `# CURRENT STATE — FOLDERA

## B. WHAT IS BROKEN (REAL)

- **Convergence depends on name overlap** — \`extractConvergence\` requires the entity name to appear in signal bodies; calendar titles without names may under-match.
`,
  );
  writeFileSync(
    join(repoDir, 'SESSION_HISTORY.md'),
    overrides?.sessionHistory ??
      `## 2026-05-11 - Prior seam
- Files changed: none
- Verification: none
`,
  );
  writeFileSync(
    join(repoDir, 'ACCEPTANCE_GATE.md'),
    overrides?.acceptanceGate ??
      'If Codex cannot prove that at least one production rung advanced, the run did not count.',
  );
}

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

  it('allows paid-proof-waiting items when the next seam is explicitly unpaid local fixture replay', () => {
    const items = parseBacklogItems(`
### BL-015
ID: BL-015
Title: Owner money-shot artifact
Starting route or trigger: Owner paid Generate Now after capacity returns, or deterministic local fixture replay when live capacity is unavailable.
Required local proof: npx vitest run lib/briefing/__tests__/artifact-quality-gate.test.ts lib/briefing/__tests__/generator-runtime.test.ts
Required production proof: Trigger one authenticated owner Generate Now paid/live run after local money-shot proof passes.
Status: WAITING_PAID_PROOF
Last evidence: Production proof remains pending; the backlog explicitly allows deterministic local fixture replay when live capacity is unavailable.
Next blocker: Run unpaid deterministic local owner-shaped money-shot replay first; keep paid owner Generate Now proof pending until local money-shot proof passes.

### BL-016
ID: BL-016
Title: Later open seam
Status: OPEN
Next blocker: Trace a local code seam.
`);

    const firstActionable = findFirstActionableBacklogItem(items);
    const eligibility = items.map(getBacklogEligibility);

    expect(firstActionable?.id).toBe('BL-015');
    expect(eligibility[0]).toMatchObject({
      actionable: true,
      reason: 'paid production proof remains pending, but unpaid deterministic local fixture replay is explicitly allowed',
    });
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
  it('generates a fallback app-owner contract when backlog has no actionable item but current truth still has an unresolved rung', () => {
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
      writeCommonControllerTruthFiles(
        repoDir,
        {
          currentState: `# CURRENT STATE — FOLDERA

## B. WHAT IS BROKEN (REAL)

- **Convergence depends on name overlap** — \`extractConvergence\` requires the entity name to appear in signal bodies; calendar titles without names may under-match.
`,
        },
      );
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git -c user.name=Test -c user.email=test@example.com commit -m init', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      const code = runControllerAutopilot(repoDir);
      const contract = JSON.parse(
        readFileSync(join(repoDir, '.foldera-contract.json'), 'utf8'),
      ) as {
        backlog_id: string;
        generated_contract_id?: string;
        money_loop_rung: string;
        allowed_file_patterns: string[];
        forbidden_file_patterns: string[];
        source_truth_file?: string;
        source_truth_finding?: string;
        required_closure_update?: string;
        required_local_proof: string;
        required_product_proof?: string;
        acceptance_condition?: string;
        stop_condition?: string;
      };

      expect(code).toBe(0);
      expect(existsSync(join(repoDir, '.foldera-contract.json'))).toBe(true);
      expect(logs.some((line) => line.includes('CONTROLLER RESULT: GO'))).toBe(true);
      expect(
        logs.some((line) =>
          line.includes('Selected backlog ID: GENERATED-CANDIDATE-SELECTION-CONVERGENCE'),
        ),
      ).toBe(true);
      expect(logs.some((line) => line.includes('Selected backlog ID: UNKNOWN'))).toBe(false);
      expect(contract.backlog_id).toBe('GENERATED-CANDIDATE-SELECTION-CONVERGENCE');
      expect(contract.generated_contract_id).toBe(
        'GENERATED-CANDIDATE-SELECTION-CONVERGENCE',
      );
      expect(contract.money_loop_rung).toBe('candidate_selection');
      expect(contract.source_truth_file).toBe('CURRENT_STATE.md');
      expect(contract.source_truth_finding).toContain('Convergence depends on name overlap');
      expect(contract.required_closure_update).toContain('Update CURRENT_STATE.md');
      expect(contract.allowed_file_patterns).toContain('lib/briefing/discrepancy-detector.ts');
      expect(contract.allowed_file_patterns).toContain('CURRENT_STATE.md');
      expect(contract.forbidden_file_patterns).toContain('app/dashboard/**');
      expect(contract.required_local_proof).toContain(
        'lib/briefing/__tests__/discrepancy-detector.test.ts',
      );
      expect(contract.required_product_proof).toContain('npm run winner:autopsy');
      expect(contract.acceptance_condition).toContain('calendar-title-only convergence');
      expect(contract.stop_condition).toContain(
        'If Codex cannot prove that at least one production rung advanced',
      );
    } finally {
      spy.mockRestore();
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('does not emit the same generated seam again after the source-truth finding is closed and committed', () => {
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
`,
      );
      writeCommonControllerTruthFiles(repoDir, {
        currentState: `# CURRENT STATE — FOLDERA

## B. WHAT IS BROKEN (REAL)

- **Convergence depends on name overlap** — \`extractConvergence\` requires the entity name to appear in signal bodies; calendar titles without names may under-match.
- **Three-day consistency is recovering** — the latest persisted generation is still historical \`do_nothing\`, and daily-value is carrying the current best move.
`,
        sessionHistory: `## 2026-05-11 - Prior seam
- Files changed: none
- Verification: daily-value still carries the current best move
`,
      });
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git -c user.name=Test -c user.email=test@example.com commit -m init', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      expect(runControllerAutopilot(repoDir)).toBe(0);
      const firstContract = JSON.parse(
        readFileSync(join(repoDir, '.foldera-contract.json'), 'utf8'),
      ) as { backlog_id: string };
      expect(firstContract.backlog_id).toBe('GENERATED-CANDIDATE-SELECTION-CONVERGENCE');

      writeFileSync(
        join(repoDir, 'CURRENT_STATE.md'),
        `# CURRENT STATE — FOLDERA

## A. WHAT IS WORKING

- **Convergence now counts known entity email aliases** — after commit 20e4f12, \`extractConvergence\` can link known entity email aliases across calendar and drive without exact body-text name overlap.

## B. WHAT IS BROKEN (REAL)

- **Three-day consistency is recovering** — the latest persisted generation is still historical \`do_nothing\`, and daily-value is carrying the current best move.
`,
      );
      writeFileSync(
        join(repoDir, 'SESSION_HISTORY.md'),
        `## 2026-05-11 - Prior seam
- Files changed: none
- Verification: daily-value still carries the current best move

## 2026-05-11 - Closure receipt
- Files changed: CURRENT_STATE.md
- Verification: closed convergence name-overlap finding after alias proof
`,
      );
      execSync('git add CURRENT_STATE.md SESSION_HISTORY.md .foldera-contract.json', {
        cwd: repoDir,
        stdio: 'ignore',
      });
      execSync('git -c user.name=Test -c user.email=test@example.com commit -m closure', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      logs.length = 0;
      expect(runControllerAutopilot(repoDir)).toBe(0);
      expect(
        logs.some((line) =>
          line.includes('Selected backlog ID: GENERATED-CANDIDATE-SELECTION-CONVERGENCE'),
        ),
      ).toBe(false);
      expect(
        logs.some((line) =>
          line.includes('Selected backlog ID: GENERATED-USEFUL-CURRENT-MOVE-DAILY-VALUE'),
        ),
      ).toBe(true);
    } finally {
      spy.mockRestore();
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('returns STOP with an exact external blocker when all remaining money-loop rungs are externally blocked', () => {
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
### BL-015
ID: BL-015
Status: WAITING_PAID_PROOF
Next blocker: explicit paid-proof approval required
`,
      );
      writeCommonControllerTruthFiles(repoDir, {
        currentState: `# CURRENT STATE — FOLDERA

## B. WHAT IS BROKEN (REAL)

- **Owner money-shot production proof** — Future proof still requires one explicitly approved paid owner run after quota returns.
- **Non-owner depth remains externally blocked** — Requires one real connected non-owner account.
`,
      });
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git -c user.name=Test -c user.email=test@example.com commit -m init', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      const code = runControllerAutopilot(repoDir);

      expect(code).toBe(1);
      expect(existsSync(join(repoDir, '.foldera-contract.json'))).toBe(false);
      expect(logs.some((line) => line.includes('CONTROLLER RESULT: STOP'))).toBe(true);
      expect(
        logs.some((line) =>
          line.includes(
            'HARD STOP REASON: All remaining money-loop rungs are externally blocked by paid/model-backed proof.',
          ),
        ),
      ).toBe(true);
      expect(
        logs.some((line) =>
          line.includes('Selected backlog ID: UNKNOWN'),
        ),
      ).toBe(true);
      expect(
        logs.some((line) => line.includes('No actionable backlog item found')),
      ).toBe(false);
    } finally {
      spy.mockRestore();
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('returns STOP when the selected backlog item is missing Money loop rung', () => {
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
### BL-778
ID: BL-778
Rung: 0
Title: Missing money loop rung
User-facing path: Local controller run
Starting route or trigger: npm run controller:autopilot
Ending success state: Contract exists
Problem: Contract can still GO without an explicit money loop rung
Protected contracts: stay inside allowed files
Allowed files: \`scripts/controller-autopilot.ts\`
Forbidden files: \`app/dashboard/**\`
Required local proof: npx vitest run scripts/__tests__/controller-autopilot.test.ts
Required production proof: None
Is user-facing: false
Browser proof command:
Done means: Controller must refuse to emit GO.
Do-not-count: stdout-only reports
Status: OPEN
Next blocker: Add the missing backlog schema field.
`,
      );
      writeCommonControllerTruthFiles(repoDir);
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git -c user.name=Test -c user.email=test@example.com commit -m init', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      const code = runControllerAutopilot(repoDir);

      expect(code).toBe(1);
      expect(existsSync(join(repoDir, '.foldera-contract.json'))).toBe(false);
      expect(logs.some((line) => line.includes('CONTROLLER RESULT: STOP'))).toBe(true);
      expect(
        logs.some((line) =>
          line.includes('HARD STOP REASON: Selected backlog item is missing Money loop rung.'),
        ),
      ).toBe(true);
    } finally {
      spy.mockRestore();
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it('writes a machine-readable contract on GO and prints next_command as the final line', () => {
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
### BL-777
ID: BL-777
Rung: 0
Money loop rung: produce_finished_work
Title: Contract enforcement
User-facing path: Local controller run
Starting route or trigger: npm run controller:autopilot
Ending success state: Contract exists
Problem: Contract was only printed
Protected contracts: stay inside allowed files, keep proof required
Allowed files: \`scripts/controller-autopilot.ts\`, \`scripts/preflight.ts\`, \`lib/briefing/__tests__/*\`, fixture/test files only when safe
Forbidden files: \`app/dashboard/**\`, billing, auth/session
Required local proof: npx vitest run scripts/__tests__/controller-autopilot.test.ts
Required production proof: None
Is user-facing: true
Browser proof command: npx playwright test tests/e2e/public-routes.spec.ts --grep "controller contract"
Done means: Controller writes contract and prints command
Do-not-count: stdout-only reports
Status: OPEN
Next blocker: Implement contract persistence.
`,
      );
      writeCommonControllerTruthFiles(repoDir);
      execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
      execSync('git -c user.name=Test -c user.email=test@example.com commit -m init', {
        cwd: repoDir,
        stdio: 'ignore',
      });

      const code = runControllerAutopilot(repoDir);
      const contract = JSON.parse(
        readFileSync(join(repoDir, '.foldera-contract.json'), 'utf8'),
      ) as {
        backlog_id: string;
        base_commit: string;
        money_loop_rung: string;
        generated_contract_id?: string;
        allowed_file_patterns: string[];
        forbidden_file_patterns: string[];
        allowed_files_raw: string;
        forbidden_files_raw: string;
        required_product_proof?: string;
        acceptance_condition?: string;
        stop_condition?: string;
        is_user_facing: boolean;
        browser_proof_command: string;
        next_command: string;
      };

      expect(code).toBe(0);
      expect(contract.backlog_id).toBe('BL-777');
      expect(contract.base_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(contract.money_loop_rung).toBe('produce_finished_work');
      expect(contract.generated_contract_id).toBeUndefined();
      expect(contract.allowed_file_patterns).toEqual([
        'scripts/controller-autopilot.ts',
        'scripts/preflight.ts',
        'lib/briefing/__tests__/*',
      ]);
      expect(contract.forbidden_file_patterns).toEqual(['app/dashboard/**']);
      expect(contract.allowed_files_raw).toContain('fixture/test files');
      expect(contract.forbidden_files_raw).toContain('billing');
      expect(contract.required_product_proof).toBe('None');
      expect(contract.acceptance_condition).toContain('Controller writes contract');
      expect(contract.stop_condition).toContain(
        'If Codex cannot prove that at least one production rung advanced',
      );
      expect(contract.is_user_facing).toBe(true);
      expect(contract.browser_proof_command).toBe(
        'npx playwright test tests/e2e/public-routes.spec.ts --grep "controller contract"',
      );
      expect(contract.next_command).toContain('Selected: BL-777.');
      expect(logs.at(-1)).toBe(contract.next_command);
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
