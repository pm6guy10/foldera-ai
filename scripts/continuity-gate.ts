import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const expectedActiveIssue = 96;
const pausedIssue = 84;
const pausedPr = 95;
const activePr = 97;

const canonicalSequence = [
  '1. Read `ACTIVE_HANDOFF.md`.',
  '2. Read `FOLDERA_LAUNCH_ROADMAP.md`.',
  '3. Read the active issue named by `ACTIVE_HANDOFF.md`.',
  '4. Read issue #48 for product doctrine.',
  '5. Read relevant execution/proof docs only for the active seam.',
  '6. Check latest open PRs and recent merged PRs when repo/deploy truth matters.',
  '7. Use Vercel/Supabase only when the seam requires live/runtime truth.',
];

const requiredFiles = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_LAUNCH_ROADMAP.md',
  'FOLDERA_OPERATING_SYSTEM.md',
  'CODEX_START.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GPT.md',
  'SYSTEM_RUNBOOK.md',
  'ACCEPTANCE_GATE.md',
  'docs/SOURCE_OF_TRUTH_MAP.md',
  'README.md',
  '.github/pull_request_template.md',
  '.github/workflows/pr-sentinel.yml',
];

const bootDocs = [
  'ACTIVE_HANDOFF.md',
  'FOLDERA_LAUNCH_ROADMAP.md',
  'FOLDERA_OPERATING_SYSTEM.md',
  'CODEX_START.md',
  'AGENTS.md',
  'CLAUDE.md',
  'GPT.md',
  'SYSTEM_RUNBOOK.md',
];

const staleDocHeaders: Record<string, string[]> = {
  'ACCEPTANCE_GATE.md': ['Authority status: PROOF_GATE'],
  'FOLDERA_PRODUCT_SPEC.md': ['Authority status: REFERENCE_ONLY'],
  'FOLDERA_PRODUCTION_BACKLOG.md': ['Authority status: REFERENCE_ONLY'],
  'FOLDERA_MASTER_AUDIT.md': ['Authority status: REFERENCE_ONLY'],
  'FOLDERA_SHIP_SPEC.md': ['Authority status: HISTORICAL_ARCHIVE'],
  'WHATS_NEXT.md': ['Authority status: HISTORICAL_ARCHIVE'],
};

const failures: string[] = [];

function readRepoFile(file: string): string {
  return readFileSync(join(root, file), 'utf8');
}

function checkRequiredFiles(): void {
  for (const file of requiredFiles) {
    if (!existsSync(join(root, file))) {
      failures.push(`Missing required source-truth file: ${file}`);
    }
  }
}

function checkCanonicalBootSequence(): void {
  for (const file of bootDocs) {
    const body = readRepoFile(file);
    if (!body.includes('## Canonical Boot Sequence')) {
      failures.push(`${file} is missing the Canonical Boot Sequence section.`);
      continue;
    }

    let lastIndex = -1;
    for (const line of canonicalSequence) {
      const nextIndex = body.indexOf(line);
      if (nextIndex === -1) {
        failures.push(`${file} is missing boot sequence line: ${line}`);
        continue;
      }
      if (nextIndex < lastIndex) {
        failures.push(`${file} has canonical boot sequence lines out of order.`);
      }
      lastIndex = nextIndex;
    }
  }
}

function checkActiveHandoff(): void {
  const body = readRepoFile('ACTIVE_HANDOFF.md');
  const activeSeamLines = body.match(/^Active implementation seam is issue #\d+.*$/gm) ?? [];
  if (activeSeamLines.length !== 1) {
    failures.push(`ACTIVE_HANDOFF.md must name exactly one active seam line; found ${activeSeamLines.length}.`);
  }

  const activeSeamLine = activeSeamLines[0] ?? '';
  const expectedActiveLine = `Active implementation seam is issue #${expectedActiveIssue}`;
  if (!activeSeamLine.startsWith(expectedActiveLine)) {
    failures.push(
      `ACTIVE_HANDOFF.md must point to issue #${expectedActiveIssue} while the hygiene safety override is active; found: ${activeSeamLine || 'none'}`,
    );
  }

  const requiredCurrentTruth = [
    `Issue #${expectedActiveIssue} is the active implementation seam.`,
    `PR #${activePr} is the active draft PR for issue #${expectedActiveIssue}.`,
    `Issue #${pausedIssue} landing polish is paused.`,
    `PR #${pausedPr} is paused and must not merge while issue #${expectedActiveIssue} is open.`,
    `Issue #${expectedActiveIssue} temporarily overrides issue #${pausedIssue} until its proof passes.`,
    `Issue #${pausedIssue} resumes only after issue #${expectedActiveIssue} is resolved.`,
  ];

  for (const marker of requiredCurrentTruth) {
    if (!body.includes(marker)) {
      failures.push(`ACTIVE_HANDOFF.md is missing active safety marker: ${marker}`);
    }
  }

  if (body.includes('Active implementation seam is issue #84')) {
    failures.push('ACTIVE_HANDOFF.md still points at paused issue #84 as the active seam.');
  }
  if (body.includes('Run issue #84 only')) {
    failures.push('ACTIVE_HANDOFF.md still instructs operators to run paused issue #84.');
  }
  if (!body.includes('FOLDERA_LAUNCH_ROADMAP.md')) {
    failures.push('ACTIVE_HANDOFF.md must reference FOLDERA_LAUNCH_ROADMAP.md.');
  }
  if (!body.includes('Issue #48 remains the product contract.')) {
    failures.push('ACTIVE_HANDOFF.md must reference issue #48 as the product contract.');
  }
}

function checkStaleDocHeaders(): void {
  for (const [file, requiredMarkers] of Object.entries(staleDocHeaders)) {
    const firstLines = readRepoFile(file).split(/\r?\n/).slice(0, 12).join('\n');
    for (const marker of requiredMarkers) {
      if (!firstLines.includes(marker)) {
        failures.push(`${file} is missing top authority marker: ${marker}`);
      }
    }
  }
}

function checkContractIsInactive(): void {
  const file = '.foldera-contract.json';
  const raw = readRepoFile(file);
  const contract = JSON.parse(raw) as {
    active?: boolean;
    authority_status?: string;
    backlog_id?: string;
    superseded_by_issue?: number;
  };

  if (contract.backlog_id?.startsWith('ISSUE_62') && contract.active !== false) {
    failures.push('.foldera-contract.json points at old issue #62 but is not marked active=false.');
  }
  if (contract.backlog_id?.startsWith('ISSUE_62') && contract.authority_status !== 'STALE_REMOVE_OR_ARCHIVE') {
    failures.push('.foldera-contract.json points at old issue #62 but lacks STALE_REMOVE_OR_ARCHIVE status.');
  }
  if (contract.backlog_id?.startsWith('ISSUE_62') && contract.superseded_by_issue !== 80) {
    failures.push('.foldera-contract.json stale status must cite issue #80 as the cleanup authority.');
  }
}

function checkReadme(): void {
  const readme = readRepoFile('README.md');
  const defaultMarkers = ['create-next-app', 'Learn More', 'Deploy on Vercel'];
  for (const marker of defaultMarkers) {
    if (readme.includes(marker)) {
      failures.push(`README.md still contains default boilerplate marker: ${marker}`);
    }
  }
}

function checkPrSentinel(): void {
  const sentinel = readRepoFile('.github/workflows/pr-sentinel.yml');
  if (!sentinel.includes('npm run gate:continuity')) {
    failures.push('PR Sentinel must run npm run gate:continuity.');
  }
  const packageJson = JSON.parse(readRepoFile('package.json')) as { scripts?: Record<string, string> };
  if (!packageJson.scripts?.['gate:continuity']) {
    failures.push('package.json is missing scripts.gate:continuity.');
  }
}

checkRequiredFiles();
checkCanonicalBootSequence();
checkActiveHandoff();
checkStaleDocHeaders();
checkContractIsInactive();
checkReadme();
checkPrSentinel();

if (failures.length > 0) {
  console.error('Continuity gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Continuity gate passed.');
