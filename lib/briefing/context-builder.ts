/**
 * Context builder — dynamically assembles situational context for the generator.
 *
 * Queries tkg_goals, tkg_commitments, tkg_actions, and recent tkg_signals at
 * generation time to produce a context block that makes the brain feel like it
 * knows the user.
 */

import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';

type GreetingSnapshot = {
  dayName: string;
  timeWord: string;
  activeCommitmentCount: number;
  topGoalText: string | null;
};

function isSelfReferentialSignal(content: string): boolean {
  return content.startsWith('[Foldera Directive') || content.startsWith('[Foldera · 20');
}

// ---------------------------------------------------------------------------
// Season + time-of-day helpers
// ---------------------------------------------------------------------------

const SEASONS: Record<number, string> = {
  0: 'deep winter',
  1: 'late winter',
  2: 'late winter/early spring, still cold',
  3: 'spring',
  4: 'late spring',
  5: 'early summer',
  6: 'summer',
  7: 'late summer',
  8: 'early fall',
  9: 'fall',
  10: 'late fall',
  11: 'early winter',
};

const DAY_ENERGY: Record<number, string> = {
  0: 'Sunday — family time, low-key planning',
  1: 'Monday — high-energy planning day, set the week',
  2: 'Tuesday — execution day, deep work',
  3: 'Wednesday — midweek, sustained execution',
  4: 'Thursday — momentum day, close open loops',
  5: 'Friday — wrap-up, tie loose ends before weekend',
  6: 'Saturday — family time, recharge',
};

function getTimeBlock(hour: number): string {
  if (hour < 6) return 'early morning — most people are asleep, but if you are up, something is on your mind';
  if (hour < 12) return 'morning — strategy and high-leverage decisions';
  if (hour < 17) return 'afternoon — execution and follow-through';
  return 'evening — reflection and preparation for tomorrow';
}

function getTimeWord(hour: number): string {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

async function getGreetingSnapshot(userId: string): Promise<GreetingSnapshot> {
  const supabase = createServerClient();
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const [commitmentsRes, goalsRes] = await Promise.all([
    supabase
      .from('tkg_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, current_priority')
      .eq('user_id', userId)
      .order('current_priority', { ascending: false })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    dayName: dayNames[now.getDay()],
    timeWord: getTimeWord(now.getHours()),
    activeCommitmentCount: commitmentsRes.count ?? 0,
    topGoalText: goalsRes.data?.goal_text?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// buildContextBlock — queries DB and returns formatted context string
// ---------------------------------------------------------------------------

export async function buildContextBlock(userId: string): Promise<string> {
  const supabase = createServerClient();
  const now = new Date();
  const month = now.getMonth();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Parallel queries
  const [goalsRes, commitmentsRes, lastActionRes, recentSignalsRes] = await Promise.all([
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category, source')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('priority', 3)
      .not('source', 'in', '("onboarding_bucket","onboarding_marker")')
      .order('priority', { ascending: false })
      .limit(3),
    supabase
      .from('tkg_commitments')
      .select('id, description, status, due_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, status')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tkg_signals')
      .select('content, source, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('occurred_at', { ascending: false })
      .limit(5),
  ]);

  const goals = goalsRes.data ?? [];
  const commitments = commitmentsRes.data ?? [];
  const lastAction = lastActionRes.data;
  const recentSignals = (recentSignalsRes.data ?? [])
    .map((signal) => {
      const decrypted = decryptWithStatus(signal.content as string ?? '');
      if (decrypted.usedFallback) return null;

      const plaintext = decrypted.plaintext.trim();
      if (!plaintext || isSelfReferentialSignal(plaintext)) return null;

      return {
        source: (signal.source as string | null) ?? 'unknown',
        occurredAt: (signal.occurred_at as string | null) ?? '',
        preview: plaintext.replace(/\s+/g, ' ').slice(0, 200),
      };
    })
    .filter((signal): signal is { source: string; occurredAt: string; preview: string } => Boolean(signal));

  // Active goals summary
  const goalLines = goals.length > 0
    ? goals.map(g => `  - [p${g.priority}] ${g.goal_text.slice(0, 100)}`).join('\n')
    : '  No active goals set.';

  // Commitment load
  const activeCount = commitments.length;
  const urgent = commitments.filter(c => c.due_at && c.due_at <= sevenDaysFromNow);
  const urgentLines = urgent.length > 0
    ? urgent.map(c => `  - ${c.description.slice(0, 80)} (due ${c.due_at?.slice(0, 10)})`).join('\n')
    : '';
  const commitmentSummary = activeCount > 0
    ? `${activeCount} active commitments${urgent.length > 0 ? `, ${urgent.length} due within 7 days:\n${urgentLines}` : ', none due within 7 days.'}`
    : 'No active commitments tracked.';

  // Last directive continuity
  const lastDirectiveLine = lastAction
    ? `Last directive: [${lastAction.action_type}] "${lastAction.directive_text?.slice(0, 80)}" — ${lastAction.status === 'executed' ? 'approved' : lastAction.status === 'skipped' || lastAction.status === 'draft_rejected' ? 'skipped' : lastAction.status}`
    : 'No prior directives. This is the first generation.';

  const recentSignalsSection = recentSignals.length > 0
    ? `\n* Recent signals (last 7 days):\n${recentSignals.map((signal) => `  - [${signal.source}, ${signal.occurredAt.slice(0, 10)}] ${signal.preview}`).join('\n')}`
    : '';

  return `CONTEXT — ${monthNames[month]} ${now.getFullYear()}:
* Location: Ellensburg, WA (central Washington, high desert, rural college town)
* Season: ${SEASONS[month]}
* Day: ${DAY_ENERGY[dayOfWeek]}
* Time: ${getTimeBlock(hour)}
* Active goals:
${goalLines}
* Commitment load: ${commitmentSummary}
* ${lastDirectiveLine}${recentSignalsSection}`;
}

// ---------------------------------------------------------------------------
// buildContextGreeting — short, contextual greeting for the dashboard
// ---------------------------------------------------------------------------

export async function buildContextGreeting(userId: string): Promise<string> {
  const snapshot = await getGreetingSnapshot(userId);
  const parts = [
    `${snapshot.dayName} ${snapshot.timeWord}.`,
    `${snapshot.activeCommitmentCount} active commitment${snapshot.activeCommitmentCount === 1 ? '' : 's'}.`,
    snapshot.topGoalText ? `Top priority: ${snapshot.topGoalText}.` : 'Top priority: None set.',
  ];

  return parts.join(' ');
}
