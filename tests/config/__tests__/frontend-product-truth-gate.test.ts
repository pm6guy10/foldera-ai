import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const BANNED_USER_FACING_PHRASES = [
  'NO REAL PRESSURE',
  'stale_selected_move_artifact',
  'selected move',
  'receipt explains',
  'safety bar',
  'mock room',
  'backend',
  'GATE_9',
  'no-safe artifact',
  'graph stale',
  'source freshness',
  'blocker packet',
  'owner/test user',
  'deterministic fixture',
  'stored winner fingerprint',
  'current receipt',
];

const UI_SOURCE_ROOTS = [
  'app/dashboard',
  'components/dashboard',
  'components/foldera',
];

const ALLOWED_FILE_PATTERNS = [
  /__tests__/,
  /\.spec\./,
  /\.test\./,
  /dashboard-money-shot-regression\.spec\.ts$/,
];

function listSourceFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  const output: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolute = path.join(absoluteDir, entry.name);
    const relative = path.relative(ROOT, absolute).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      output.push(...listSourceFiles(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !ALLOWED_FILE_PATTERNS.some((pattern) => pattern.test(relative))) {
      output.push(relative);
    }
  }
  return output;
}

describe('frontend product truth gate', () => {
  it('has a durable frontend gate command and contract doc', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['gate:frontend']).toContain('dashboard-money-shot-regression.spec.ts');
    expect(packageJson.scripts?.['gate:frontend']).toContain('frontend-product-truth-gate');

    const doc = fs.readFileSync(path.join(ROOT, 'docs/FRONTEND_PRODUCT_TRUTH_GATE.md'), 'utf8');
    expect(doc).toContain('npm run gate:frontend');
    expect(doc).toContain('screenshot baselines');
    expect(doc).toContain('interaction audit');
    expect(doc).toContain('banned-copy audit');
    expect(doc).toContain('may not say DONE, PROVEN, or next blocker is GATE_9');
    expect(doc).toContain('production current desktop 1440x900');
    expect(doc).toContain('production current mobile 390x844');
    expect(doc).toContain('## Layout Contract');
    expect(doc).toContain('Foldera held back because the evidence was not strong enough.');
    expect(doc).toContain('API-only or backend-only proof is not a frontend pass');

    const gateScript = fs.readFileSync(
      path.join(ROOT, 'scripts/frontend-product-truth-gate.ts'),
      'utf8',
    );
    expect(gateScript).toContain('production current screenshots');
    expect(gateScript).toContain('layout contract');
    expect(gateScript).toContain('backend-only frontend done claim');
  });

  it('keeps banned backend/internal copy out of dashboard UI source strings', () => {
    const leaks: string[] = [];
    for (const file of UI_SOURCE_ROOTS.flatMap(listSourceFiles)) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const phrase of BANNED_USER_FACING_PHRASES) {
        if (text.toLowerCase().includes(phrase.toLowerCase())) {
          leaks.push(`${file}: ${phrase}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });
});
