import { createServerClient } from '@/lib/db/client';
import Anthropic from '@anthropic-ai/sdk';
import { decryptWithStatus } from '@/lib/encryption';

export async function refreshGoalContext(): Promise<{ ok: boolean; updated: number; skipped: number; decayed: number }> {
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
        model: 'claude-haiku-4-5-20251001',
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

  // --- Goal decay: demote goals with no signal reinforcement in 30+ days ---
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let decayed = 0;

  for (const userId of userIds) {
    const { data: staleGoals } = await supabase
      .from('tkg_goals')
      .select('id, goal_text, priority, updated_at, source')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('priority', 3)
      .lt('updated_at', thirtyDaysAgo);

    for (const goal of (staleGoals ?? [])) {
      // Never decay user-stated goals below priority 3
      if (goal.source === 'onboarding_stated' && goal.priority <= 3) continue;
      // Never decay onboarding bucket goals below priority 2
      if (goal.source === 'onboarding_bucket' && goal.priority <= 2) continue;

      const newPriority = Math.max(2, goal.priority - 1);
      if (newPriority < goal.priority) {
        await supabase
          .from('tkg_goals')
          .update({ priority: newPriority, updated_at: new Date().toISOString() })
          .eq('id', goal.id);
        decayed++;
      }
    }
  }

  return { ok: true, updated, skipped, decayed };
}

// ---------------------------------------------------------------------------
// Behavioral goal inference — extract goals from recurring signal themes
// ---------------------------------------------------------------------------

/** Goal sources that are onboarding placeholders — excluded from matching. */
const PLACEHOLDER_GOAL_SOURCES = new Set(['onboarding_bucket', 'onboarding_marker']);

/**
 * Scan the last 14 days of tkg_signals for recurring entities, themes, and
 * commitments that don't match any existing tkg_goals row. If a theme
 * appears in 5+ signals with no matching goal, create a new inferred goal
 * with source = 'extracted' and current_priority derived from signal
 * frequency and recency.
 *
 * Designed to run every 7 days (called from nightly-ops on Sundays or
 * after every 7th run).
 */
export async function inferGoalsFromBehavior(): Promise<{
  ok: boolean;
  inferred: number;
  usersScanned: number;
}> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Get all users with recent signals
  const { data: userRows } = await supabase
    .from('tkg_signals')
    .select('user_id')
    .eq('processed', true)
    .gte('occurred_at', fourteenDaysAgo)
    .limit(500);

  const userIds = [...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id))];

  let totalInferred = 0;

  for (const userId of userIds) {
    // Load existing goals (non-placeholder) for dedup
    const { data: existingGoalRows } = await supabase
      .from('tkg_goals')
      .select('goal_text, goal_category, source')
      .eq('user_id', userId)
      .eq('status', 'active');

    const existingGoals = ((existingGoalRows ?? []) as Array<{ goal_text: string; goal_category: string; source: string }>)
      .filter((g) => !PLACEHOLDER_GOAL_SOURCES.has(g.source ?? ''));

    // Flatten existing goal keywords for overlap detection
    const existingKeywords = new Set<string>();
    for (const g of existingGoals) {
      for (const w of g.goal_text.toLowerCase().split(/\s+/).filter((w: string) => w.length >= 4)) {
        existingKeywords.add(w);
      }
    }

    // Load signals (14d)
    const { data: signalRows } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at')
      .eq('user_id', userId)
      .eq('processed', true)
      .gte('occurred_at', fourteenDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(200);

    if (!signalRows || signalRows.length < 10) continue;

    // Decrypt and collect entity/theme tokens from signals
    const themeBuckets: Record<string, { count: number; recency: number; samples: string[] }> = {};

    for (const s of signalRows) {
      const decrypted = decryptWithStatus((s.content as string) ?? '');
      if (decrypted.usedFallback) continue;
      const text = decrypted.plaintext;
      if (!text || text.length < 30) continue;
      // Skip self-referential
      if (text.startsWith('[Foldera Directive') || text.startsWith('[Foldera \u00b7 20')) continue;

      // Extract proper noun phrases (2+ capitalized words) as theme candidates
      const properNouns = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) ?? [];
      // Extract recurring verbs/themes (common action themes)
      const themePatterns = text.match(/\b(?:hiring|interview|application|claim|insurance|investment|debt|budget|remodel|renovation|client|proposal|contract|certification|exam|course|training)\b/gi) ?? [];

      const allThemes = [...properNouns, ...themePatterns.map((t) => t.toLowerCase())];

      const signalAge = (Date.now() - new Date((s.occurred_at as string) ?? '').getTime()) / (1000 * 60 * 60 * 24);

      for (const theme of allThemes) {
        const key = theme.toLowerCase().trim();
        if (key.length < 4) continue;
        // Skip if this theme is already covered by existing goals
        const themeWords = key.split(/\s+/);
        const overlapCount = themeWords.filter((w) => existingKeywords.has(w)).length;
        if (overlapCount >= Math.min(2, themeWords.length)) continue;

        if (!themeBuckets[key]) {
          themeBuckets[key] = { count: 0, recency: Infinity, samples: [] };
        }
        themeBuckets[key].count++;
        themeBuckets[key].recency = Math.min(themeBuckets[key].recency, signalAge);
        if (themeBuckets[key].samples.length < 3) {
          themeBuckets[key].samples.push(text.slice(0, 150));
        }
      }
    }

    // Filter: themes appearing in 5+ signals with no matching goal
    const inferredThemes = Object.entries(themeBuckets)
      .filter(([, data]) => data.count >= 5)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 3); // max 3 new goals per user per cycle

    for (const [theme, data] of inferredThemes) {
      // Derive priority from frequency and recency: more signals + more recent = higher
      const frequencyScore = Math.min(5, Math.floor(data.count / 5) + 2); // 5 signals = p2, 10 = p3, 15 = p4
      const recencyBoost = data.recency < 3 ? 1 : 0; // boost if seen in last 3 days
      const priority = Math.min(5, Math.max(2, frequencyScore + recencyBoost));

      // Infer category from theme content
      let category = 'other';
      const lower = theme.toLowerCase();
      if (/\b(?:hiring|interview|job|application|resume|career|salary|role|position)\b/.test(lower)) category = 'career';
      else if (/\b(?:invest|debt|budget|financial|money|payment|claim|insurance)\b/.test(lower)) category = 'financial';
      else if (/\b(?:remodel|renovation|project|build|design|launch)\b/.test(lower)) category = 'project';
      else if (/\b(?:health|exercise|fitness|doctor|therapy|medication)\b/.test(lower)) category = 'health';

      // Construct goal text
      const goalText = `Inferred from behavior: recurring theme "${theme}" (${data.count} signals in 14 days, ${data.samples.length > 0 ? 'e.g. ' + data.samples[0].slice(0, 80) : 'no sample'})`;

      // Check dedup: is this goal text too similar to an existing one?
      const goalLower = goalText.toLowerCase();
      const isDuplicate = existingGoals.some((g) => {
        const gWords = g.goal_text.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
        const newWords = goalLower.split(/\s+/).filter((w) => w.length >= 4);
        const overlap = gWords.filter((w) => newWords.includes(w)).length;
        return overlap >= 3;
      });

      if (isDuplicate) continue;

      const { error } = await supabase
        .from('tkg_goals')
        .insert({
          user_id: userId,
          goal_text: goalText,
          goal_category: category,
          priority,
          source: 'extracted',
          current_priority: priority >= 3,
        });

      if (!error) {
        totalInferred++;
        // Add to existing keywords so subsequent themes don't duplicate
        for (const w of goalText.toLowerCase().split(/\s+/).filter((w) => w.length >= 4)) {
          existingKeywords.add(w);
        }
      }
    }
  }

  return { ok: true, inferred: totalInferred, usersScanned: userIds.length };
}
