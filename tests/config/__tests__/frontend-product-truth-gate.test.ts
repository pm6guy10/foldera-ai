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
  'Recent Work support',
  'Sources support',
  'Account support',
  'Foldera keeps this panel inside the same app shell',
  'Drop a folder or document',
  'Foldera will get to work instantly',
  'Same-place controls',
  'legacy rooms',
];

const BANNED_HOMEPAGE_MARKETING_PHRASES = [
  'daily brief',
  'Today answer',
  'Today’s answer',
  "Today's answer",
  'inbox triage',
  'task list',
  'finished work every morning',
  'Your day. Already done.',
  'See the Right Now flow',
  'Source trail',
  'SOC 2',
  '4.8/5',
  'enterprise ready',
  'AI agent',
  'autonomous assistant',
  'screen reading',
  'surveillance',
];

const REQUIRED_HOMEPAGE_COPY = [
  // Hero headline → hero subhead → pilot section headline. These map to live
  // sections of components/foldera/LandingPage.tsx. The former "One trusted
  // answer. All the context. Next move ready." line lived in the FINAL CTA
  // section that #414 intentionally removed as a redundant stacked CTA, so it
  // is no longer part of the approved landing direction.
  'Stop rebuilding the work.',
  'Foldera holds the thread across your apps, then pings you in Slack with the one finished move that matters — context attached, ready to approve.',
  'Stop checking nine apps.',
];

const APPROVED_HOMEPAGE_DOCTRINE_COPY = [
  'No surveillance',
  'No hidden activity monitoring, no screen-reading, and no surveillance framing.',
  'Foldera is not another inbox, task list, or dashboard to babysit.',
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
    expect(doc).toContain('real-user surface checks');
    expect(doc).toContain('Recent Work rows may not show raw artifact or generated body text');
    expect(doc).toContain('dashboard performance timing proof');
    expect(doc).toContain('common viewport density');

    const gateScript = fs.readFileSync(
      path.join(ROOT, 'scripts/frontend-product-truth-gate.ts'),
      'utf8',
    );
    expect(gateScript).toContain('production current screenshots');
    expect(gateScript).toContain('layout contract');
    expect(gateScript).toContain('backend-only frontend done claim');
    expect(gateScript).toContain('real-user surface checks');
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

  it('locks homepage copy to the Workday Presence Layer landing direction', () => {
    const landingPage = fs.readFileSync(
      path.join(ROOT, 'components/foldera/LandingPage.tsx'),
      'utf8',
    );

    for (const phrase of REQUIRED_HOMEPAGE_COPY) {
      expect(landingPage).toContain(phrase);
    }

    const landingPageForMarketingAudit = APPROVED_HOMEPAGE_DOCTRINE_COPY.reduce(
      (text, phrase) => text.replaceAll(phrase, ''),
      landingPage,
    );

    const leaks = BANNED_HOMEPAGE_MARKETING_PHRASES.filter((phrase) =>
      landingPageForMarketingAudit.toLowerCase().includes(phrase.toLowerCase()),
    );
    expect(leaks).toEqual([]);
  });
});
