import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('documentation source-of-truth boundaries', () => {
  it('keeps the operating constitution and gate-first boot contract present as repo-owned doctrine', () => {
    const operatingSystem = fs.readFileSync(path.join(process.cwd(), 'FOLDERA_OPERATING_SYSTEM.md'), 'utf8');
    const codexStart = fs.readFileSync(path.join(process.cwd(), 'CODEX_START.md'), 'utf8');
    const activeHandoff = fs.readFileSync(path.join(process.cwd(), 'ACTIVE_HANDOFF.md'), 'utf8');
    const buildOrder = fs.readFileSync(path.join(process.cwd(), 'FOLDERA_BUILD_ORDER.yaml'), 'utf8');
    const canonicalBootSequence = [
      '1. Read `ACTIVE_HANDOFF.md`.',
      '2. Read `FOLDERA_LAUNCH_ROADMAP.md`.',
      '3. Read the active issue named by `ACTIVE_HANDOFF.md`.',
      '4. Read issue #48 for product doctrine.',
      '5. Read relevant execution/proof docs only for the active seam.',
      '6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.',
      '7. Use Vercel/Supabase only when the seam requires live/runtime truth.',
    ];

    expect(operatingSystem).toContain('Foldera is not a dashboard.');
    expect(operatingSystem).toContain('Foldera is an operator.');
    expect(operatingSystem).toContain('Produce finished value.');
    expect(operatingSystem).toContain('Safely self-prepare or self-recover.');
    expect(operatingSystem).toContain('Ask for one irreducible blocker');
    expect(codexStart).toContain("You are Foldera's acting senior operator");
    expect(codexStart).toContain('one assigned seam');
    expect(codexStart).toContain('move Foldera through the first failing gate with proof');
    for (const line of canonicalBootSequence) {
      expect(codexStart).toContain(line);
      expect(activeHandoff).toContain(line);
    }
    expect(codexStart).toContain('No Codex self-certification counts.');
    expect(codexStart).toContain('Fix only that CI failure.');
    expect(codexStart).toContain('Maximum product issues per Codex session: 1.');
    expect(activeHandoff).toContain('# ACTIVE HANDOFF');
    expect(activeHandoff).toContain('## Current slice:');
    expect(activeHandoff).toContain('## GitHub writeback contract');
    expect(activeHandoff).toContain('GitHub writeback before stop is mandatory.');
    expect(activeHandoff).toContain('Chat memory is not source of truth.');
    expect(activeHandoff).toContain('If work was done and not written to GitHub, the transaction is incomplete.');
    expect(activeHandoff).toContain('## Next exact move');
    expect(buildOrder).toContain('writeback_required: true');
    expect(buildOrder).toContain('source_of_truth_order:');
    expect(buildOrder).toContain('accepted_terminal_states:');
    expect(activeHandoff.split(/\r?\n/).length).toBeLessThanOrEqual(95);
  });

  it('keeps the active runbook explicit about which docs own current status, done criteria, and receipts', () => {
    const runbook = fs.readFileSync(path.join(process.cwd(), 'SYSTEM_RUNBOOK.md'), 'utf8');

    expect(runbook).toContain('## Source-of-Truth Boundaries');
    expect(runbook).toContain('ACTIVE_HANDOFF.md');
    expect(runbook).toContain('FOLDERA_LAUNCH_ROADMAP.md');
    expect(runbook).toContain('GitHub issue #48');
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
    expect(agents).toContain('`ACTIVE_HANDOFF.md` controls current command state and the next exact move');
    expect(agents).toContain('`FOLDERA_BUILD_ORDER.yaml` controls machine-readable active issue, paused issues, and closeout requirements');
    expect(agents).toContain('`FOLDERA_LAUNCH_ROADMAP.md` controls launch order and roadmap continuity');
    expect(agents).toContain('`FOLDERA_OPERATING_SYSTEM.md` controls product doctrine and worldview');
    expect(agents).toContain('`CODEX_START.md` controls session boot order');
    expect(agents).toContain('`AGENTS.md` controls agent behavior and repo-specific execution rules');
    expect(agents).toContain('`ACCEPTANCE_GATE.md` controls product proof');
    expect(agents).toContain('`CURRENT_STATE.md` controls current blockers and runtime truth');
    expect(agents).toContain('`SESSION_HISTORY.md` is receipt history only');
    expect(agents).toContain('Specs, audits, backlog, and historical docs are reference only');
  });
});
