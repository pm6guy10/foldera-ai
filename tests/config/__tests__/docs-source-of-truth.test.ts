import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation source-of-truth boundaries', () => {
  it('keeps the operating constitution and boot contract present as repo-owned doctrine', () => {
    const operatingSystem = fs.readFileSync(path.join(process.cwd(), 'FOLDERA_OPERATING_SYSTEM.md'), 'utf8');
    const codexStart = fs.readFileSync(path.join(process.cwd(), 'CODEX_START.md'), 'utf8');

    expect(operatingSystem).toContain('Foldera is not a dashboard.');
    expect(operatingSystem).toContain('Foldera is an operator.');
    expect(operatingSystem).toContain('Produce finished value.');
    expect(operatingSystem).toContain('Safely self-prepare or self-recover.');
    expect(operatingSystem).toContain('Ask for one irreducible blocker');
    expect(codexStart).toContain("You are Foldera's acting senior operator.");
    expect(codexStart).toContain('FOLDERA_OPERATING_SYSTEM.md');
    expect(codexStart).toContain('Everything else is owned by you.');
  });

  it('keeps the active runbook explicit about which docs own current status, done criteria, and receipts', () => {
    const runbook = fs.readFileSync(path.join(process.cwd(), 'SYSTEM_RUNBOOK.md'), 'utf8');

    expect(runbook).toContain('## Source-of-Truth Boundaries');
    expect(runbook).toContain('FOLDERA_OPERATING_SYSTEM.md');
    expect(runbook).toContain('CODEX_START.md');
    expect(runbook).toContain('AGENTS.md');
    expect(runbook).toContain('ACCEPTANCE_GATE.md');
    expect(runbook).toContain('CURRENT_STATE.md');
    expect(runbook).toContain('FOLDERA_MASTER_AUDIT.md');
    expect(runbook).toContain('SESSION_HISTORY.md is append-only receipt history');
    expect(runbook).toContain('FULL_AUDIT_RESULTS.md is audit evidence, not a mutable checklist');
  });

  it('keeps AGENTS as the active controller for source-of-truth loading order', () => {
    const agents = fs.readFileSync(path.join(process.cwd(), 'AGENTS.md'), 'utf8');

    expect(agents).toContain('## Source-of-Truth Loading Hierarchy');
    expect(agents).toContain('`FOLDERA_OPERATING_SYSTEM.md` controls product doctrine and worldview');
    expect(agents).toContain('`CODEX_START.md` controls session boot order');
    expect(agents).toContain('`AGENTS.md` controls agent behavior and repo-specific execution rules');
    expect(agents).toContain('`ACCEPTANCE_GATE.md` controls product proof');
    expect(agents).toContain('`CURRENT_STATE.md` controls current blockers and runtime truth');
    expect(agents).toContain('`SESSION_HISTORY.md` is recent receipt history only');
    expect(agents).toContain('reference only; load them only when the seam touches them');
  });
});
