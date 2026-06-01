import { readFileSync } from 'node:fs';

export function runSourceTruthCheck(root = process.cwd()): string[] {
  const handoff = readFileSync(`${root}/ACTIVE_HANDOFF.md`, 'utf8');
  const buildOrder = readFileSync(`${root}/FOLDERA_BUILD_ORDER.yaml`, 'utf8');
  const failures: string[] = [];

  if (!handoff.includes('Active implementation seam is issue #123')) {
    failures.push('ACTIVE_HANDOFF.md must name issue #123 as active.');
  }

  if (!buildOrder.includes('active_issue: 123')) {
    failures.push('FOLDERA_BUILD_ORDER.yaml must name issue #123 as active.');
  }

  return failures;
}
