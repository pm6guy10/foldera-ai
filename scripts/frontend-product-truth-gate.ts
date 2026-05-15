import fs from 'node:fs';
import path from 'node:path';

type GateResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const root = process.cwd();

const requiredSnapshotNames = [
  'money-shot-finished-desktop',
  'money-shot-finished-mobile',
  'money-shot-requirements-desktop',
  'money-shot-requirements-mobile',
  'money-shot-no-safe-desktop',
  'money-shot-no-safe-mobile',
  'dashboard-real-user-today-desktop',
  'dashboard-real-user-today-mobile',
  'dashboard-real-user-history-desktop',
  'dashboard-real-user-history-mobile',
  'dashboard-real-user-sources-desktop',
  'dashboard-real-user-sources-mobile',
  'dashboard-real-user-account-desktop',
  'dashboard-real-user-account-mobile',
];

const requiredDocPhrases = [
  'npm run gate:frontend',
  'screenshot baselines',
  'interaction audit',
  'banned-copy audit',
  'finished, requirements-needed, and no-safe states',
  'production current desktop 1440x900',
  'production current mobile 390x844',
  'Foldera held back because the evidence was not strong enough.',
  '## Layout Contract',
  'layout contract result',
  'API-only or backend-only proof is not a frontend pass',
  'may not say DONE, PROVEN, or next blocker is GATE_9',
  'real-user surface checks',
  'support rail may not contain generic support filler',
  'Recent Work rows may not show raw artifact or generated body text',
  'fake upload/drop cards may not appear active',
  'fake notification controls may not appear active',
  'dashboard performance timing proof',
  'common viewport density',
];

const requiredReceiptPhrases = [
  'gate:frontend',
  'screenshot matrix',
  'interaction matrix',
  'banned-copy audit',
  'layout contract',
  'production current screenshots',
];

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(root, relativePath));
}

function findFiles(dir: string, predicate: (file: string) => boolean): string[] {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  const output: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const full = path.join(absolute, entry.name);
    const relative = path.relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      output.push(...findFiles(relative, predicate));
    } else if (predicate(relative)) {
      output.push(relative);
    }
  }
  return output;
}

function result(name: string, passed: boolean, detail: string): GateResult {
  return { name, passed, detail };
}

const results: GateResult[] = [];

const docPath = 'docs/FRONTEND_PRODUCT_TRUTH_GATE.md';
results.push(result('frontend gate doc exists', fileExists(docPath), docPath));

if (fileExists(docPath)) {
  const doc = readText(docPath);
  for (const phrase of requiredDocPhrases) {
    results.push(result(`frontend doc phrase: ${phrase}`, doc.includes(phrase), phrase));
  }
}

const specPath = 'tests/e2e/dashboard-money-shot-regression.spec.ts';
const spec = fileExists(specPath) ? readText(specPath) : '';
results.push(
  result('money-shot Playwright spec exists', Boolean(spec), specPath),
  result('visual snapshots use toHaveScreenshot', spec.includes('toHaveScreenshot'), specPath),
  result('interaction test is present', spec.includes('copy, skip, save, approve, and requirements packet controls give feedback'), specPath),
  result('rendered banned-copy test is present', spec.includes('BANNED_VISIBLE_COPY'), specPath),
  result('real-user surface checks are present', spec.includes('BANNED_DASHBOARD_SHELL_COPY'), specPath),
  result('raw Recent Work guard is present', spec.includes('raw history text'), specPath),
  result('performance timing proof is present', spec.includes('DASHBOARD_TIMING'), specPath),
  result('common viewport density proof is present', spec.includes('common viewport containment'), specPath),
  result('panel screenshot proof is present', spec.includes('dashboard-real-user-${panel}-${viewport.name}.png'), specPath),
);

const snapshotFiles = findFiles('tests/e2e', (file) =>
  file.includes('dashboard-money-shot-regression.spec.ts-snapshots') && file.endsWith('.png'),
);
for (const snapshotName of requiredSnapshotNames) {
  const matched = snapshotFiles.some((file) => file.includes(snapshotName));
  results.push(result(`snapshot committed: ${snapshotName}`, matched, snapshotName));
}

const handoff = fileExists('ACTIVE_HANDOFF.md') ? readText('ACTIVE_HANDOFF.md') : '';
const history = fileExists('SESSION_HISTORY.md') ? readText('SESSION_HISTORY.md') : '';
const latestHistorySlice = history.slice(-5000);
results.push(
  result('handoff references gate:frontend', /gate:frontend/i.test(handoff), 'ACTIVE_HANDOFF.md'),
  result('handoff references screenshot matrix', /screenshot matrix/i.test(handoff), 'ACTIVE_HANDOFF.md'),
  result('handoff references interaction matrix', /interaction matrix/i.test(handoff), 'ACTIVE_HANDOFF.md'),
  result('latest history references gate:frontend', /gate:frontend/i.test(latestHistorySlice), 'SESSION_HISTORY.md'),
  result('latest history references screenshot matrix', /screenshot matrix/i.test(latestHistorySlice), 'SESSION_HISTORY.md'),
  result('latest history references interaction matrix', /interaction matrix/i.test(latestHistorySlice), 'SESSION_HISTORY.md'),
);

for (const phrase of requiredReceiptPhrases) {
  const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  results.push(
    result(`handoff frontend receipt phrase: ${phrase}`, pattern.test(handoff), 'ACTIVE_HANDOFF.md'),
    result(`latest history frontend receipt phrase: ${phrase}`, pattern.test(latestHistorySlice), 'SESSION_HISTORY.md'),
  );
}

results.push(
  result(
    'backend-only frontend done claim is blocked',
    /API-only or backend-only proof is not a frontend pass/i.test(readText(docPath)),
    docPath,
  ),
  result(
    'layout contract is executable doctrine',
    /## Layout Contract/i.test(readText(docPath)) && /text hidden behind footer controls/i.test(readText(docPath)),
    docPath,
  ),
);

const doctrineFiles = ['CODEX_START.md', 'GPT.md', 'docs/QUALITY_GATES.md', docPath];
for (const doctrineFile of doctrineFiles) {
  const text = fileExists(doctrineFile) ? readText(doctrineFile) : '';
  results.push(
    result(
      `${doctrineFile} blocks GATE_9 fallback before frontend proof`,
      /GATE_9/i.test(text) && /gate:frontend/i.test(text),
      doctrineFile,
    ),
  );
}

const failed = results.filter((item) => !item.passed);

for (const item of results) {
  const status = item.passed ? 'PASS' : 'FAIL';
  console.log(`${status} ${item.name} - ${item.detail}`);
}

if (failed.length > 0) {
  console.error(`FRONTEND PRODUCT TRUTH GATE: FAIL (${failed.length} failed)`);
  process.exit(1);
}

console.log('FRONTEND PRODUCT TRUTH GATE: PASS');
