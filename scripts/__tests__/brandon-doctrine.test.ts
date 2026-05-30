import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..');

function readDoc(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

describe('Brandon product-owner doctrine', () => {
  it('keeps active agent doctrine focused on wrong-path detection and proof before done', () => {
    const agents = readDoc('AGENTS.md');
    const claude = readDoc('CLAUDE.md');

    for (const doc of [agents, claude]) {
      expect(doc).toContain('Brandon Product-Owner Doctrine');
      expect(doc).toContain('WRONG PATH');
      expect(doc).toContain('If no actionable seam exists');
      expect(doc).toContain('No actionable seam; STOP');
      expect(doc).toContain('A fix is done only when the affected path is proven at the right gate');
      expect(doc).toContain('Never count docs, logs, screenshots, green build, local unit tests, or CI by themselves as product success');
      expect(doc).toContain('Never run paid tests by default');
      expect(doc).toContain('Never send outbound email by default');
    }
  });

  it('keeps product success tied to browser/product proof, not local signals', () => {
    const acceptanceGate = readDoc('ACCEPTANCE_GATE.md');
    const runbook = readDoc('SYSTEM_RUNBOOK.md');

    expect(acceptanceGate).toContain('Browser/product proof is the closure standard');
    expect(acceptanceGate).toContain('Proof must include the affected CI lane');
    expect(acceptanceGate).toContain('Local proof that omits the CI check capable of failing the seam does not count');
    expect(acceptanceGate).toContain('files changed, tests passed, docs updated, CI green, logs, screenshots, and build output are never product success by themselves');
    expect(acceptanceGate).toContain('If browser/product proof is missing or fails, the verdict is NOT DONE');

    expect(runbook).toContain('DONE only when browser/product proof passed');
    expect(runbook).toContain('NOT DONE when code changed but product proof is missing or failed');
    expect(runbook).not.toContain('  - FIXED');
    expect(runbook).not.toContain('  - PARTIALLY FIXED');
  });

  it('locks the dashboard UI proof ladder to the CI lane that can fail it', () => {
    const acceptanceGate = readDoc('ACCEPTANCE_GATE.md');

    expect(acceptanceGate).toContain('For dashboard/UI work, the permanent proof gate is:');
    expect(acceptanceGate).toContain('npm run build');
    expect(acceptanceGate).toContain('npm run lint');
    expect(acceptanceGate).toContain('npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose');
    expect(acceptanceGate).toContain('npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list');
  });
});
