import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

function lineCount(relativePath: string): number {
  const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
  return source.split(/\r?\n/).length;
}

describe('large-file split seams', () => {
  it('keeps the dashboard route below the audit complexity threshold', () => {
    expect(lineCount('app/dashboard/page.tsx')).toBeLessThanOrEqual(1000);
    // The old dashboard-page-model + DashboardSecondaryPanel split files were dead (the live
    // route renders ProductShell/MorningAnchorCard); deleted as zero-import orphans in #425.
    expect(existsSync(path.join(repoRoot, 'app/dashboard/dashboard-page-model.tsx'))).toBe(false);
    expect(existsSync(path.join(repoRoot, 'components/dashboard/DashboardSecondaryPanel.tsx'))).toBe(false);
  });
});
