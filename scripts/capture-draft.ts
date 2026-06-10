#!/usr/bin/env npx tsx
// Capture uncommitted local work to Foldera intake (Issue #165).
// Run any time you have local changes you haven't committed yet:
//   npx tsx scripts/capture-draft.ts

import { execSync } from 'child_process';

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const branch = run('git rev-parse --abbrev-ref HEAD') || 'unknown';
const status = run('git status --short') || '(clean)';
const diffStat = run('git diff --stat') || '(no unstaged changes)';
const stash = run('git stash list') || '(no stashes)';
const recentCommits = run('git log --oneline -5') || '(no commits)';

const rawText = [
  `DRAFT CAPTURE [${branch}] — uncommitted work snapshot`,
  `Date: ${new Date().toISOString()}`,
  '',
  'Git status:',
  status,
  '',
  'Unstaged diff stat:',
  diffStat,
  '',
  'Stashes:',
  stash,
  '',
  'Recent commits:',
  recentCommits,
].join('\n');

async function main() {
  let res: Response;
  try {
    res = await fetch('https://www.foldera.ai/api/command-os/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });
  } catch (err) {
    console.error('Network error — is foldera.ai reachable?', err);
    process.exit(1);
  }

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    const text = await res.text().catch(() => '');
    console.error(`Capture failed (HTTP ${res.status}):`, text.slice(0, 200));
    process.exit(1);
  }

  const wb = body.writeBack as Record<string, unknown> | undefined;
  if (body.ok) {
    console.log(`Captured to Issue #165: ${wb?.commentUrl}`);
  } else {
    console.error('Capture failed:', body);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
