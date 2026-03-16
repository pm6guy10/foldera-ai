/**
 * Context builder — dynamically assembles situational context for the generator.
 *
 * Queries tkg_goals, tkg_commitments, and tkg_actions at generation time
 * to produce a context block that makes the brain feel like it knows the user.
 */

import { createServerClient } from '@/lib/db/client';

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
  const [goalsRes, commitmentsRes, lastActionRes] = await Promise.all([
    supabase
      .from('tkg_goals')
      .select('goal_text, priority, goal_category')
      .eq('user_id', userId)
      .gte('priority', 3)
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
  ]);

  const goals = goalsRes.data ?? [];
  const commitments = commitmentsRes.data ?? [];
  const lastAction = lastActionRes.data;

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

  return `CONTEXT — ${monthNames[month]} ${now.getFullYear()}:
* Location: Ellensburg, WA (central Washington, high desert, rural college town)
* Season: ${SEASONS[month]}
* Day: ${DAY_ENERGY[dayOfWeek]}
* Time: ${getTimeBlock(hour)}
* Active goals:
${goalLines}
* Commitment load: ${commitmentSummary}
* ${lastDirectiveLine}`;
}

// ---------------------------------------------------------------------------
// buildContextGreeting — short, contextual greeting for the dashboard
// ---------------------------------------------------------------------------

export async function buildContextGreeting(userId: string): Promise<string> {
  const supabase = createServerClient();
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day = dayNames[now.getDay()];
  const hour = now.getHours();
  const timeWord = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  // Parallel: commitments count + last action + urgent commitments
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [commitmentsRes, lastActionRes, urgentRes] = await Promise.all([
    supabase
      .from('tkg_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, status')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('tkg_commitments')
      .select('description, due_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .lte('due_at', sevenDaysFromNow)
      .order('due_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeCount = commitmentsRes.count ?? 0;
  const lastAction = lastActionRes.data;
  const urgentCommitment = urgentRes.data;

  // Build a short, contextual line
  const parts: string[] = [`${day} ${timeWord}.`];

  if (activeCount > 0) {
    parts.push(`${activeCount} commitment${activeCount === 1 ? '' : 's'} active.`);
  }

  if (urgentCommitment?.due_at) {
    const daysUntil = Math.ceil((new Date(urgentCommitment.due_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) {
      parts.push(`${urgentCommitment.description.slice(0, 50)} is overdue.`);
    } else if (daysUntil <= 2) {
      parts.push(`${urgentCommitment.description.slice(0, 50)} due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`);
    }
  } else if (lastAction) {
    const verb = lastAction.status === 'executed' ? 'approved' :
      lastAction.status === 'skipped' || lastAction.status === 'draft_rejected' ? 'skipped' : 'pending';
    if (verb !== 'pending') {
      // Extract the key noun from the directive for continuity
      const shortDirective = lastAction.directive_text?.slice(0, 40) ?? '';
      parts.push(`Last read ${verb}.`);
      if (shortDirective && activeCount === 0) {
        parts.push('Nothing urgent. Good day to build.');
      }
    }
  }

  if (activeCount === 0 && !urgentCommitment && !lastAction) {
    parts.push('Nothing tracked yet.');
  }

  return parts.join(' ');
}
