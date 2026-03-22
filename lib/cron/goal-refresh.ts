import { createServerClient } from '@/lib/db/client';
import Anthropic from '@anthropic-ai/sdk';

export async function refreshGoalContext(): Promise<{ ok: boolean; updated: number; skipped: number }> {
  const supabase = createServerClient();

  // Get all distinct users with priority >= 3 goals
  const { data: goalRows } = await supabase
    .from('tkg_goals')
    .select('user_id')
    .gte('priority', 3);

  const userIds = [...new Set((goalRows ?? []).map((r: { user_id: string }) => r.user_id))];

  let updated = 0;
  let skipped = 0;

  for (const userId of userIds) {
    // Load current goals
    const { data: goals } = await supabase
      .from('tkg_goals')
      .select('id, goal_text, priority, goal_category')
      .eq('user_id', userId)
      .gte('priority', 3);

    if (!goals || goals.length === 0) { skipped++; continue; }

    // Load recent signals for context
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', fourteenDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (!signals || signals.length < 5) { skipped++; continue; }

    // Use Claude to enrich each goal with entity names from signals
    const anthropic = new Anthropic();

    for (const goal of goals) {
      // Find signals relevant to this goal (keyword overlap)
      const goalWords = (goal.goal_text as string).toLowerCase().split(/\s+/).filter((w: string) => w.length >= 4);
      const relevantSignals = signals.filter((s: { content: unknown }) => {
        const content = ((s.content as string) ?? '').toLowerCase();
        return goalWords.some((w: string) => content.includes(w));
      }).slice(0, 10);

      if (relevantSignals.length < 2) continue;

      const signalText = relevantSignals
        .map((s: { occurred_at: unknown; content: unknown }) =>
          `[${((s.occurred_at as string) ?? '').slice(0, 10)}] ${((s.content as string) ?? '').slice(0, 200)}`)
        .join('\n');

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Current goal: "${goal.goal_text}"

Recent signals mentioning this goal:
${signalText}

Rewrite the goal text to include specific entity names (people, organizations, job titles, claim numbers, dates) found in the signals. Keep the core intent identical. Add parenthetical context with the entities. Do not add information not present in the signals. Return ONLY the rewritten goal text, nothing else.`
        }]
      });

      const enriched = response.content[0]?.type === 'text' ? response.content[0].text.trim() : null;

      if (enriched && enriched.length > (goal.goal_text as string).length && enriched.length < 500) {
        await supabase
          .from('tkg_goals')
          .update({ goal_text: enriched, updated_at: new Date().toISOString() })
          .eq('id', goal.id);
        updated++;
      }
    }
  }

  return { ok: true, updated, skipped };
}
