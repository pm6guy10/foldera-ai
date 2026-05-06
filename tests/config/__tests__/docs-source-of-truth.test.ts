import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation source-of-truth boundaries', () => {
  it('keeps the active runbook explicit about which docs own current status, done criteria, and receipts', () => {
    const runbook = fs.readFileSync(path.join(process.cwd(), 'SYSTEM_RUNBOOK.md'), 'utf8');

    expect(runbook).toContain('## Source-of-Truth Boundaries');
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
    expect(agents).toContain('`AGENTS.md` controls agent behavior');
    expect(agents).toContain('`ACCEPTANCE_GATE.md` controls product proof');
    expect(agents).toContain('`CURRENT_STATE.md` controls current blockers and runtime truth');
    expect(agents).toContain('`SESSION_HISTORY.md` is recent receipt history only');
    expect(agents).toContain('reference only; load them only when the seam touches them');
  });
});
