/**
 * Preflight infrastructure check for Codex/agent runs.
 *
 * Answers: "Is the production pipeline CAPABLE of generating?"
 * If not, stop - the problem is infrastructure, not code.
 *
 * Exit 0 = infrastructure healthy, proceed to code work.
 * Exit 1 = infrastructure broken, do not write code.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      OWNER_USER_ID (required).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

import { ActionRow, CheckResult, evaluatePaidLlmGate, Verdict } from './preflight-core';

config({ path: resolve(process.cwd(), '.env.local') });

const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;

interface TokenRow {
  provider: string;
  expires_at: number | null;
  disconnected_at: string | null;
  last_synced_at: string | null;
}

function relAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'invalid';
  const diff = Date.now() - t;
  if (diff < 0) return '0m ago';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ago`;
  return `${m}m ago`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = (process.env.OWNER_USER_ID || '').trim();

  if (!url || !key || !userId) {
    console.error('PREFLIGHT ABORT: Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OWNER_USER_ID');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const checks: CheckResult[] = [];

  try {
    const { data, error } = await supabase
      .from('tkg_actions')
      .select('action_type, directive_text, generated_at, status, confidence, artifact')
      .eq('user_id', userId)
      .not('generated_at', 'is', null)
      .order('generated_at', { ascending: false, nullsFirst: false })
      .limit(10);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ActionRow[];

    if (rows.length === 0) {
      checks.push({
        name: 'Pipeline output',
        verdict: 'WARN',
        detail: 'No tkg_actions rows found.',
      });
    } else {
      checks.push(evaluatePaidLlmGate(rows, relAgo));
      const allPaidLlmDisabled = rows.every(
        (r) => r.directive_text === 'paid_llm_disabled' || r.action_type === 'do_nothing',
      );

      const lastReal = rows.find(
        (r) => r.action_type !== 'do_nothing' && r.directive_text !== 'paid_llm_disabled',
      );
      if (!lastReal) {
        checks.push({
          name: 'Last real artifact',
          verdict: allPaidLlmDisabled ? 'FAIL' : 'WARN',
          detail: 'No non-do_nothing action in last 10 rows.',
          fix: allPaidLlmDisabled
            ? 'Infrastructure is blocking generation. Fix Paid LLM gate first.'
            : 'Pipeline may be stuck. Check scorer/generator logs.',
        });
      } else {
        const age = Date.now() - new Date(lastReal.generated_at!).getTime();
        const stale = age > FORTY_EIGHT_H_MS;
        checks.push({
          name: 'Last real artifact',
          verdict: stale ? 'WARN' : 'PASS',
          detail: `${lastReal.action_type} "${(lastReal.artifact as { title?: string })?.title ?? lastReal.directive_text ?? '(no title)'}" - ${relAgo(lastReal.generated_at)}`,
          fix: stale ? 'Pipeline has not generated a real artifact in 48h+.' : undefined,
        });
      }

      const pendingRows = rows.filter((r) => r.status === 'pending_approval');
      if (pendingRows.length > 0) {
        const oldest = pendingRows[pendingRows.length - 1];
        const age = Date.now() - new Date(oldest.generated_at!).getTime();
        checks.push({
          name: 'Pending approval queue',
          verdict: age > 24 * 60 * 60 * 1000 ? 'WARN' : 'PASS',
          detail: `${pendingRows.length} pending - oldest ${relAgo(oldest.generated_at)}`,
        });
      }
    }
  } catch (e) {
    checks.push({
      name: 'Pipeline output',
      verdict: 'FAIL',
      detail: `Query failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  try {
    const { data, error } = await supabase
      .from('user_tokens')
      .select('provider, expires_at, disconnected_at, last_synced_at')
      .eq('user_id', userId)
      .in('provider', ['google', 'microsoft']);

    if (error) throw new Error(error.message);
    const tokens = (data ?? []) as TokenRow[];
    const active = tokens.filter((t) => t.disconnected_at == null);

    if (active.length === 0) {
      checks.push({
        name: 'Connected tokens',
        verdict: 'FAIL',
        detail: 'No active Google or Microsoft tokens.',
        fix: 'User must reconnect at /dashboard/settings.',
      });
    } else {
      for (const token of active) {
        const synced = token.last_synced_at;
        const stale =
          synced == null ||
          Date.now() - new Date(synced).getTime() > FORTY_EIGHT_H_MS;
        checks.push({
          name: `${token.provider} token`,
          verdict: stale ? 'WARN' : 'PASS',
          detail: `last synced ${relAgo(synced)}`,
          fix: stale
            ? `${token.provider} data is stale. May need reauth at /dashboard/settings.`
            : undefined,
        });
      }
    }
  } catch (e) {
    checks.push({
      name: 'Token health',
      verdict: 'FAIL',
      detail: `Query failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const localPaidLlm = process.env.ALLOW_PAID_LLM;
  checks.push({
    name: 'Local ALLOW_PAID_LLM',
    verdict: localPaidLlm === 'true' ? 'PASS' : 'WARN',
    detail: localPaidLlm === 'true' ? 'set' : `${localPaidLlm === undefined ? 'unset' : `"${localPaidLlm}"`} - local runs will skip LLM`,
  });

  const fails = checks.filter((c) => c.verdict === 'FAIL');
  const warns = checks.filter((c) => c.verdict === 'WARN');
  const passes = checks.filter((c) => c.verdict === 'PASS');

  console.log('');
  console.log('===============================================');
  console.log('  FOLDERA PREFLIGHT');
  console.log('===============================================');
  console.log('');

  for (const c of checks) {
    const icon = c.verdict === 'PASS' ? '✓' : c.verdict === 'WARN' ? '⚠' : '✗';
    console.log(`  ${icon} ${c.name}: ${c.detail}`);
    if (c.fix) {
      console.log(`    -> FIX: ${c.fix}`);
    }
  }

  console.log('');
  console.log(`  ${passes.length} pass · ${warns.length} warn · ${fails.length} FAIL`);
  console.log('');

  if (fails.length > 0) {
    console.log('  VERDICT: ✗ INFRASTRUCTURE BROKEN');
    console.log('  Do not write code. Fix the above failures first.');
    console.log('  These are deployment/config problems, not code problems.');
    console.log('');
    process.exit(1);
  }

  if (warns.length > 0) {
    console.log('  VERDICT: ⚠ INFRASTRUCTURE DEGRADED - proceed with caution');
  } else {
    console.log('  VERDICT: ✓ INFRASTRUCTURE HEALTHY - proceed to code work');
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error('Preflight crashed:', e);
  process.exit(1);
});
