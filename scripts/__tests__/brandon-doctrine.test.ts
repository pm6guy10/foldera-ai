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

    expect(agents).toContain('Brandon Product-Owner Doctrine');
    expect(agents).toContain('WRONG PATH');
    expect(agents).toContain('If no actionable seam exists');
    expect(agents).toContain('No actionable seam; STOP');
    expect(agents).toContain('A fix is done only when the affected path is proven at the right gate');
    expect(agents).toContain('Never count docs, logs, screenshots, green build, local unit tests, or CI by themselves as product success');
    expect(agents).toContain('Never run paid tests by default');
    expect(agents).toContain('Never send outbound email by default');
  });

  it('keeps product success tied to browser/product proof, not local signals', () => {
    const agents = readDoc('AGENTS.md');

    expect(agents).toContain('Browser/product proof is the closure standard');
    expect(agents).toContain('Proof must include the affected CI lane');
    expect(agents).toContain('Local proof that omits the CI check capable of failing the seam does not count');
    expect(agents).toContain('If browser/product proof is missing or fails, the verdict is NOT DONE');
  });

  it('locks the dashboard UI proof ladder to the CI lane that can fail it', () => {
    const agents = readDoc('AGENTS.md');

    expect(agents).toContain('For dashboard/UI work, the permanent proof gate is:');
    expect(agents).toContain('npm run build');
    expect(agents).toContain('npm run lint');
    expect(agents).toContain('npx vitest run tests/config/__tests__/large-file-splits.test.ts --reporter=verbose');
    expect(agents).toContain('npx playwright test tests/e2e/dashboard-navigation.spec.ts tests/e2e/authenticated-routes.spec.ts --reporter=list');
  });
});
