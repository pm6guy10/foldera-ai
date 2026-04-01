import type { SupabaseClient } from '@supabase/supabase-js';
import { insertAgentDraft } from '@/lib/agents/draft-queue';
import { runAgentSonnet } from '@/lib/agents/anthropic-runner';
import { getAllUsersWithProvider } from '@/lib/auth/user-tokens';
import { TEST_USER_ID } from '@/lib/config/constants';

const MS_7D = 7 * 24 * 60 * 60 * 1000;
const MS_3D = 3 * 24 * 60 * 60 * 1000;

async function loadGoalsSnippet(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('tkg_goals')
    .select('goal_text, priority')
    .eq('user_id', userId)
    .eq('status', 'active')
    .neq('source', 'system_config')
    .order('priority', { ascending: true })
    .limit(6);

  return (data ?? [])
    .map((g) => `- (${g.priority}) ${g.goal_text}`)
    .join('\n');
}

async function countActions(
  supabase: SupabaseClient,
  userId: string,
  sinceIso: string,
): Promise<{ sent: number; approved: number; skipped: number }> {
  const { data } = await supabase
    .from('tkg_actions')
    .select('status')
    .eq('user_id', userId)
    .gte('generated_at', sinceIso);

  let sent = 0;
  let approved = 0;
  let skipped = 0;
  for (const row of data ?? []) {
    const s = row.status as string;
    if (s === 'pending_approval' || s === 'executed' || s === 'approved') sent++;
    if (s === 'executed' || s === 'approved') approved++;
    if (s === 'skipped' || s === 'draft_rejected') skipped++;
  }
  return { sent, approved, skipped };
}

async function consecutiveSkips(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('tkg_actions')
    .select('status')
    .eq('user_id', userId)
    .in('status', ['skipped', 'draft_rejected', 'executed', 'approved', 'pending_approval'])
    .order('generated_at', { ascending: false })
    .limit(12);

  let n = 0;
  for (const row of data ?? []) {
    const s = row.status as string;
    if (s === 'skipped' || s === 'draft_rejected') n++;
    else break;
  }
  return n;
}

async function lastBriefOpen(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('tkg_signals')
    .select('occurred_at')
    .eq('user_id', userId)
    .eq('type', 'daily_brief_opened')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.occurred_at ?? null;
}

export async function runRetentionAnalystAgent(supabase: SupabaseClient): Promise<{
  staged: number;
  summary: string;
}> {
  const since = new Date(Date.now() - MS_7D).toISOString();
  const google = await getAllUsersWithProvider('google');
  const ms = await getAllUsersWithProvider('microsoft');
  const users = [...new Set([...google, ...ms])].filter((id) => id !== TEST_USER_ID);

  const flagged: Array<{
    userId: string;
    reason: string;
    goals: string;
    metrics: string;
  }> = [];

  for (const userId of users) {
    const { sent, approved, skipped } = await countActions(supabase, userId, since);
    const skips = await consecutiveSkips(supabase, userId);
    const lastOpen = await lastBriefOpen(supabase, userId);
    const openAge = lastOpen ? Date.now() - new Date(lastOpen).getTime() : Number.POSITIVE_INFINITY;

    let reason = '';
    if (skips >= 3) reason = '3+ consecutive skips on recent directives';
    else if (openAge > MS_3D && sent > 0) reason = 'no daily brief open signal in 3+ days';
    else if (sent === 0 && skipped === 0) reason = 'connected but no directives in the last 7 days';

    if (!reason) continue;

    const goals = await loadGoalsSnippet(supabase, userId);
    flagged.push({
      userId,
      reason,
      goals: goals || '(no active goals loaded)',
      metrics: `7d: sent/pending-ish=${sent}, approved/executed=${approved}, skipped=${skipped}, trailing_skip_streak=${skips}`,
    });
    if (flagged.length >= 8) break;
  }

  if (flagged.length === 0) {
    return { staged: 0, summary: 'no retention flags' };
  }

  let staged = 0;
  for (const f of flagged.slice(0, 5)) {
    const sonnet = await runAgentSonnet({
      job: 'retention_analyst',
      system:
        'Write a short, personal re-engagement email body (plain text, <= 180 words). Reference their goals concretely. No guilt trips. No fake metrics. Never include UUIDs or internal IDs in the email. Sign as Brandon @ Foldera.',
      messages: [
        {
          role: 'user',
          content: [
            `Why flagged: ${f.reason}`,
            `Metrics: ${f.metrics}`,
            'Stated goals:',
            f.goals,
          ].join('\n'),
        },
      ],
    });

    if ('error' in sonnet) continue;

    const ins = await insertAgentDraft(supabase, 'retention_analyst', {
      title: `Re-engagement email — user ${f.userId.slice(0, 8)}…`,
      directiveLine: `Draft retention email (${f.reason})`,
      body: ['## Draft email', '', sonnet.text, '', '---', 'Internal:', f.metrics].join('\n'),
      fixPrompt: `Edit this retention email for tone. Do not invent events. User flag reason: ${f.reason}\n\n${sonnet.text}`,
      extraExecutionFields: { flagged_user_id: f.userId, flag_reason: f.reason },
    });
    if (!('error' in ins)) staged++;
  }

  return { staged, summary: `staged ${staged}` };
}
