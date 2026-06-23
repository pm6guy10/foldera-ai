/**
 * roll-pointer — stamp the control plane (ACTIVE_SEAM_STATE.json) in one command
 * instead of hand-editing JSON every PR cycle, then validate with the continuity gate.
 *
 * This exists because the per-session friction audit found that pointer bookkeeping
 * (active_branch / active_pr / deployed_commit_sha / last_verified_at) was being edited
 * by hand every open/merge cycle — and that the active_pr stamp gates nothing in CI
 * (the PR gate ci.yml does not run the continuity gate; pr-sentinel.yml is manual
 * workflow_dispatch only). So: stamp it cheaply when convenient, don't churn commits.
 *
 * Usage:
 *   npm run roll -- --pr 526                              # stamp active_pr=526, branch+sha from git
 *   npm run roll -- --no-pr                               # active_pr=null (post-merge resting state)
 *   npm run roll -- --no-pr --sha 65e8adb                # also set deployed_commit_sha
 *   npm run roll -- --issue 518 --note "..."              # optionally update active_issue / notes
 *   npm run roll -- --cron-outcome generation_returned    # stamp last cron result after Supabase check
 *
 * Defaults: active_branch = current git branch; deployed_commit_sha keeps its current
 * value unless --sha is given; last_verified_at = now. Always runs the continuity gate
 * and exits non-zero if it fails, so the stamp is self-validating.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runContinuityGate } from './continuity-gate';

const ROOT = process.cwd();
const STATE_PATH = join(ROOT, 'ACTIVE_SEAM_STATE.json');

type SeamState = Record<string, unknown> & {
  active_issue?: number | null;
  active_branch?: string | null;
  active_pr?: number | null;
  deployed_commit_sha?: string | null;
  last_verified_at?: string | null;
  last_cron_run?: string | null;
  last_cron_outcome?: string | null;
  notes?: string | null;
};

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function parseArgs(argv: string[]): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out.set(key, true);
    } else {
      out.set(key, next);
      i += 1;
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) as SeamState;

  // active_branch — always the current branch.
  let branch: string;
  try {
    branch = git('branch --show-current');
  } catch {
    branch = String(state.active_branch ?? '');
  }
  if (branch) state.active_branch = branch;

  // active_pr — --pr <n> sets it, --no-pr nulls it, omitted leaves it untouched.
  if (args.has('no-pr')) {
    state.active_pr = null;
  } else if (args.has('pr')) {
    const n = Number(args.get('pr'));
    if (!Number.isFinite(n)) {
      console.error(`roll: --pr must be a number (got "${String(args.get('pr'))}")`);
      process.exit(1);
    }
    state.active_pr = n;
  }

  // deployed_commit_sha — --sha <x>, else default to current HEAD short sha.
  if (args.has('sha')) {
    state.deployed_commit_sha = String(args.get('sha'));
  } else {
    try {
      state.deployed_commit_sha = git('rev-parse --short HEAD');
    } catch {
      /* keep existing */
    }
  }

  if (args.has('issue')) {
    const n = Number(args.get('issue'));
    if (Number.isFinite(n)) state.active_issue = n;
  }
  if (args.has('note')) {
    state.notes = String(args.get('note'));
  }
  if (args.has('cron-outcome')) {
    state.last_cron_outcome = String(args.get('cron-outcome'));
    state.last_cron_run = new Date().toISOString();
  }

  state.last_verified_at = new Date().toISOString();

  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(
    `roll: stamped ACTIVE_SEAM_STATE.json — issue #${state.active_issue ?? '?'}, branch ${state.active_branch ?? '?'}, ` +
      `pr ${state.active_pr ?? 'null'}, deployed ${state.deployed_commit_sha ?? '?'}.`,
  );

  const failures = runContinuityGate(ROOT, { issueStateFetcher: () => 'skip' });
  if (failures.length > 0) {
    console.error('roll: continuity gate FAILED after stamp:');
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
  console.log('roll: continuity gate passed.');
}

main();
