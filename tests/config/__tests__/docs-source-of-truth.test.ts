import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation source-of-truth boundaries', () => {
  it('keeps the operating constitution and gate-first boot contract present as repo-owned doctrine', () => {
    const operatingSystem = fs.readFileSync(path.join(process.cwd(), 'FOLDERA_OPERATING_SYSTEM.md'), 'utf8');
    const codexStart = fs.readFileSync(path.join(process.cwd(), 'CODEX_START.md'), 'utf8');
    const activeHandoff = fs.readFileSync(path.join(process.cwd(), 'ACTIVE_HANDOFF.md'), 'utf8');
    const readOrder =
      codexStart.match(
        /Read these before acting:\r?\n\r?\n([\s\S]*?)\r?\n\r?\n## Prime Directive/,
      )?.[1] ?? '';

    expect(operatingSystem).toContain('Foldera is not a dashboard.');
    expect(operatingSystem).toContain('Foldera is an operator.');
    expect(operatingSystem).toContain('Produce finished value.');
    expect(operatingSystem).toContain('Safely self-prepare or self-recover.');
    expect(operatingSystem).toContain('Ask for one irreducible blocker');
    expect(codexStart).toContain("You are Foldera's acting senior operator and app owner.");
    expect(codexStart).toContain('move Foldera through the first failing gate with proof');
    expect(readOrder.trimStart()).toMatch(/^1\. `GPT\.md`/);
    expect(readOrder).toContain('`ACTIVE_HANDOFF.md`');
    expect(readOrder).toContain('`CURRENT_STATE.md`');
    expect(readOrder).toContain('`SYSTEM_RUNBOOK.md`');
    expect(readOrder).toContain('`docs/RELEASE_GATES.md`');
    expect(readOrder).toContain('`docs/QUALITY_GATES.md`');
    expect(codexStart).toContain('No Codex self-certification counts.');
    expect(codexStart).toContain('`npm run health`');
    expect(codexStart).toContain('`npm run gate:status`');
    expect(codexStart).toContain('`npm run gate:quality`');
    expect(codexStart).toContain('`npm run gate:visual`');
    expect(codexStart).toContain('Fix only the first failing gate.');
    expect(codexStart).toContain('Foldera is not beta-ready unless release, quality, and visual gates agree.');
    expect(codexStart).toContain('Maximum product issues per Codex session: 1.');
    expect(activeHandoff).toContain('# ACTIVE HANDOFF');
    expect(activeHandoff).toContain('Current slice:');
    expect(activeHandoff).toContain('## Next exact move');
    expect(activeHandoff.split(/\r?\n/).length).toBeLessThanOrEqual(80);
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
    expect(runbook).toContain(
      'Update `FOLDERA_PRODUCTION_BACKLOG.md` and `SESSION_HISTORY.md` when the selected issue changes backlog truth, controller truth, or contract doctrine.',
    );
  });

  it('keeps AGENTS as the active controller for source-of-truth loading order', () => {
    const agents = fs.readFileSync(path.join(process.cwd(), 'AGENTS.md'), 'utf8');

    expect(agents).toContain('## Source-of-Truth Loading Hierarchy');
    expect(agents).toContain('`FOLDERA_OPERATING_SYSTEM.md` controls product doctrine and worldview');
    expect(agents).toContain('`CODEX_START.md` controls session boot order');
    expect(agents).toContain('`ACTIVE_HANDOFF.md` controls current command state and the next exact move');
    expect(agents).toContain('`AGENTS.md` controls agent behavior and repo-specific execution rules');
    expect(agents).toContain('`ACCEPTANCE_GATE.md` controls product proof');
    expect(agents).toContain('`CURRENT_STATE.md` controls current blockers and runtime truth');
    expect(agents).toContain('`SESSION_HISTORY.md` is recent receipt history only');
    expect(agents).toContain('reference only; load them only when the seam touches them');
  });
});
