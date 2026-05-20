import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const MESSAGING_SURFACE_PATTERNS: RegExp[] = [
  /^app\/api\/slack\//,
  /^app\/slack\//,
  /^lib\/slack-test-mode\//,
  /^lib\/workday-presence\/message\.ts$/,
];

const SCREENSHOT_PROOF_PATTERNS: RegExp[] = [
  /^docs\/pr-\d+-screens\/.+\.png$/i,
];

function tryListChangedFilesAgainstMain(): string[] | null {
  try {
    // Use merge-base so local branches and CI PR refs behave the same.
    const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' }).trim();
    return out ? out.split('\n').map((l) => l.trim()).filter(Boolean) : [];
  } catch {
    return null;
  }
}

function listAllProofPngs(): string[] {
  const docsDir = path.join(ROOT, 'docs');
  if (!fs.existsSync(docsDir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^pr-\d+-screens$/.test(entry.name)) continue;
    const proofDir = path.join(docsDir, entry.name);
    for (const file of fs.readdirSync(proofDir, { withFileTypes: true })) {
      if (file.isFile() && /\.png$/i.test(file.name)) out.push(`docs/${entry.name}/${file.name}`.replace(/\\/g, '/'));
    }
  }
  return out;
}

describe('messaging surface screenshot proof enforcement', () => {
  it('requires screenshot proof files when messaging surface changes', () => {
    const changed = tryListChangedFilesAgainstMain();
    if (changed === null) return; // Not enforceable without git context; keep test deterministic.

    const touchedMessagingSurface = changed.some((f) => MESSAGING_SURFACE_PATTERNS.some((p) => p.test(f)));
    if (!touchedMessagingSurface) return;

    const includedProof = changed.some((f) => SCREENSHOT_PROOF_PATTERNS.some((p) => p.test(f)));
    if (includedProof) return;

    const existingProof = listAllProofPngs();
    expect(existingProof.length).toBeGreaterThan(0);
    expect(
      [
        'Messaging surface changed without screenshot proof files in this PR.',
        'Add at least one screenshot under docs/pr-<PR>-screens/*.png and commit it.',
        `Changed files: ${changed.join(', ')}`,
      ].join('\n'),
    ).toBe('');
  });
});

