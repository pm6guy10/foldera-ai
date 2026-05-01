import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..');

function readDoc(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('Brandon product-owner doctrine', () => {
  it('locks the pre-code grill gate and done audit into active agent doctrine', () => {
    const agents = readDoc('AGENTS.md');
    const claude = readDoc('CLAUDE.md');

    for (const doc of [agents, claude]) {
      expect(doc).toContain('Brandon Product-Owner Doctrine');
      expect(doc).toContain('WRONG PATH');
      expect(doc).toContain('Mandatory Pre-Code Grill Gate');
      expect(doc).toContain('Exact user-facing path');
      expect(doc).toContain('Regression test that fails first');
      expect(doc).toContain('Browser/product proof');
      expect(doc).toContain('Mandatory Done Audit');
      expect(doc).toContain('Paid calls used');
      expect(doc).toContain('Outbound email sent');
      expect(doc).toContain('Final verdict: DONE or NOT DONE');
      expect(doc).toContain('No actionable seam; STOP');
    }
  });

  it('keeps product success tied to browser/product proof, not local signals', () => {
    const acceptanceGate = readDoc('ACCEPTANCE_GATE.md');
    const runbook = readDoc('SYSTEM_RUNBOOK.md');

    expect(acceptanceGate).toContain('Browser/product proof is the closure standard');
    expect(acceptanceGate).toContain('files changed, tests passed, docs updated, CI green, logs, screenshots, and build output are never product success by themselves');
    expect(acceptanceGate).toContain('If browser/product proof is missing or fails, the verdict is NOT DONE');

    expect(runbook).toContain('DONE only when browser/product proof passed');
    expect(runbook).toContain('NOT DONE when code changed but product proof is missing or failed');
    expect(runbook).not.toContain('  - FIXED');
    expect(runbook).not.toContain('  - PARTIALLY FIXED');
  });
});
