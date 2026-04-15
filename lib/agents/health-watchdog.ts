import type { SupabaseClient } from '@supabase/supabase-js';
import { HEALTH_WATCHDOG_API_PATHS, HEALTH_WATCHDOG_PAGE_PATHS } from '@/lib/agents/health-routes';
import { insertAgentDraft } from '@/lib/agents/draft-queue';
import { TEST_USER_ID } from '@/lib/config/constants';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { ptDayStartIso } from '@/lib/cron/daily-brief-generate';

function baseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://foldera.ai'
  ).replace(/\/$/, '');
}

async function probePath(path: string): Promise<{ path: string; ok: boolean; status?: number; err?: string }> {
  const url = `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'FolderaAgentHealth/1.0' },
    });
    return { path, ok: res.ok, status: res.status };
  } catch (e: unknown) {
    return { path, ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

export async function runHealthWatchdogAgent(supabase: SupabaseClient): Promise<{
  staged: boolean;
  summary: string;
}> {
  const issues: string[] = [];

  for (const p of [...HEALTH_WATCHDOG_PAGE_PATHS, ...HEALTH_WATCHDOG_API_PATHS]) {
    const r = await probePath(p);
    if (!r.ok) {
      issues.push(
        `GET ${p} failed${r.status != null ? ` (HTTP ${r.status})` : ''}${r.err ? `: ${r.err}` : ''}`,
      );
    }
  }

  const dayStart = ptDayStartIso();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: failCount } = await supabase
    .from('tkg_actions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('generated_at', since);

  if ((failCount ?? 0) > 0) {
    issues.push(`tkg_actions: ${failCount} row(s) with status=failed in the last 24h`);
  }

  const { data: tokenRows } = await supabase
    .from('user_tokens')
    .select('user_id, provider, expires_at')
    .not('access_token', 'is', null)
    .is('disconnected_at', null);

  const nowSec = Math.floor(Date.now() / 1000);
  const expired = (tokenRows ?? []).filter((row) => typeof row.expires_at === 'number' && row.expires_at < nowSec);
  if (expired.length > 0) {
    issues.push(
      `user_tokens: ${expired.length} connected row(s) have access token expires_at in the past (refresh may still work)`,
    );
  }

  const googleUsers = await getAllUsersWithProvider('google');
  const msUsers = await getAllUsersWithProvider('microsoft');
  const connected = new Set([...googleUsers, ...msUsers]);
  connected.delete(TEST_USER_ID);

  const briefMiss: string[] = [];
  for (const userId of connected) {
    const { data: todayActions } = await supabase
      .from('tkg_actions')
      .select('id, execution_result, status, generated_at')
      .eq('user_id', userId)
      .gte('generated_at', dayStart)
      .limit(40);

    const sent = (todayActions ?? []).some((row: Record<string, unknown>) => {
      const er = row.execution_result as Record<string, unknown> | null;
      return er && typeof er.daily_brief_sent_at === 'string';
    });
    const pending = (todayActions ?? []).some((row) => row.status === 'pending_approval');
    const skippedNoSend = (todayActions ?? []).some((row) => row.status === 'skipped');

    if (!sent && !pending && !skippedNoSend) {
      briefMiss.push(userId);
    }
  }

  if (briefMiss.length > 0) {
    issues.push(
      `Daily brief pipeline: ${briefMiss.length} connected user(s) have no send/pending/skip action since PT day start (may be expected before morning cron).`,
    );
  }

  if (issues.length === 0) {
    return { staged: false, summary: 'all green' };
  }

  const what = issues.join('\n');
  const fixPrompt = [
    'You are fixing Foldera production health issues reported by the Health Watchdog agent.',
    '',
    'Observed issues:',
    what,
    '',
    'Steps:',
    '1. Reproduce each failing GET from the same host (check middleware, auth, and Vercel routing).',
    '2. For failed tkg_actions, inspect execution_result.last_error and conviction execute paths.',
    '3. For token expiry rows, confirm refresh flow in lib/auth/token-store.ts and user_tokens.expires_at units.',
    '4. For daily brief gaps, verify nightly-ops and runDailySend logs for those user IDs.',
    '',
    'Push directly to main. Do not create a branch.',
  ].join('\n');

  const ins = await insertAgentDraft(supabase, 'health_watchdog', {
    title: 'Health Watchdog: issues detected',
    directiveLine: 'System health check found problems in the last run.',
    body: ['## What broke', '', what, ''].join('\n'),
    whatBroke: what,
    fixPrompt,
  });

  if ('error' in ins) {
    return { staged: false, summary: `draft insert failed: ${ins.error}` };
  }

  return { staged: true, summary: `staged draft ${ins.id}` };
}
