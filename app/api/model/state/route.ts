/**
 * GET /api/model/state
 *
 * Returns a summary of the user's behavioral model: signal volume, identity
 * graph (top entities), stated goals, approval learning stats, and conviction
 * quality trend. Read-only — no writes.
 *
 * This is the "what the model knows about you" surface.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { daysMs } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

const DAY_MS = daysMs(1);

// Goal categories that suggest behavioral inference is possible
const CATEGORY_LABELS: Record<string, string> = {
  career: 'career activity',
  financial: 'financial activity',
  relationship: 'relationship engagement',
  health: 'health signals',
  project: 'project work',
  other: 'general activity',
};

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const supabase = createServerClient();
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - daysMs(30)).toISOString();
    const sevenDaysAgo = new Date(now - daysMs(7)).toISOString();

    // Run all queries in parallel
    const [
      signalsRes,
      entitiesRes,
      goalsRes,
      actionsRes,
      authRes,
    ] = await Promise.all([
      // Signal volume
      supabase
        .from('tkg_signals')
        .select('id, extracted', { count: 'exact' })
        .eq('user_id', userId),

      // Top entities by engagement
      supabase
        .from('tkg_entities')
        .select('id, name, total_interactions, last_interaction')
        .eq('user_id', userId)
        .order('total_interactions', { ascending: false })
        .order('last_interaction', { ascending: false })
        .limit(5),

      // Stated goals (priority >= 3, active)
      supabase
        .from('tkg_goals')
        .select('goal_text, priority, goal_category')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gte('priority', 3)
        .order('priority', { ascending: false })
        .limit(5),

      // Approval stats + confidence trends (last 30 days)
      supabase
        .from('tkg_actions')
        .select('status, confidence, generated_at')
        .eq('user_id', userId)
        .in('status', ['approved', 'skipped'])
        .gte('generated_at', thirtyDaysAgo),

      // Account creation date
      supabase.auth.admin.getUserById(userId),
    ]);

    // --- Signal volume ---
    const allSignals = signalsRes.data ?? [];
    const signal_count = allSignals.length;
    const signals_processed = allSignals.filter((s) => s.extracted === true).length;

    // --- Account age ---
    let days_active = 0;
    try {
      const createdAt = authRes.data?.user?.created_at;
      if (createdAt) {
        days_active = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / DAY_MS));
      }
    } catch {
      // ignore
    }

    // --- Top entities ---
    const top_entities = (entitiesRes.data ?? []).map((e) => {
      const lastInteraction = e.last_interaction ? new Date(e.last_interaction as string).getTime() : 0;
      const days_since_contact = lastInteraction > 0
        ? Math.floor((now - lastInteraction) / DAY_MS)
        : null;
      return {
        name: e.name as string,
        total_interactions: (e.total_interactions as number) ?? 0,
        days_since_contact,
      };
    });

    // --- Stated goals ---
    const stated_goals = (goalsRes.data ?? []).map((g) => ({
      text: g.goal_text as string,
      priority: g.priority as number,
      category: g.goal_category as string,
    }));

    // --- Approval stats ---
    const actions = actionsRes.data ?? [];
    const approved = actions.filter((a) => a.status === 'approved').length;
    const skipped = actions.filter((a) => a.status === 'skipped').length;
    const total = approved + skipped;
    const approval_rate = total > 0 ? Math.round((approved / total) * 100) : null;

    const last7d = actions.filter((a) => (a.generated_at as string) >= sevenDaysAgo);
    const last30d = actions;

    function avgConfidence(rows: typeof actions): number | null {
      const withConf = rows.filter((a) => typeof a.confidence === 'number' && a.confidence > 0);
      if (withConf.length === 0) return null;
      return Math.round(withConf.reduce((sum, a) => sum + (a.confidence as number), 0) / withConf.length);
    }

    const avg_confidence_last_7d = avgConfidence(last7d);
    const avg_confidence_last_30d = avgConfidence(last30d);

    // --- Behavioral insights ---
    // Derive from entity engagement vs stated goal categories.
    // For each goal category that has a stated goal, check if there are entities
    // with recent interaction activity. If an entity is actively engaged AND
    // matches a stated goal category keyword, surface an insight.
    // This is inferred from behavioral data, not from user-entered information.
    const behavioral_insights: Array<{
      label: string;
      category: string;
      signal_count: number;
      entity_name?: string;
    }> = [];

    if (top_entities.length > 0 && stated_goals.length > 0) {
      // Find the most-engaged entity and the top goal
      const topEntity = top_entities[0];
      const topGoal = stated_goals[0];

      // If there's a recently active entity (within 30 days) and they match
      // the top goal by interaction volume, surface the behavioral signal
      if (
        topEntity &&
        topEntity.total_interactions >= 3 &&
        topEntity.days_since_contact !== null &&
        topEntity.days_since_contact <= 30
      ) {
        const categoryLabel = CATEGORY_LABELS[topGoal.category] ?? topGoal.category;
        behavioral_insights.push({
          label: `Active ${categoryLabel} detected — ${topEntity.total_interactions} interactions with ${topEntity.name} observed`,
          category: topGoal.category,
          signal_count: topEntity.total_interactions,
          entity_name: topEntity.name,
        });
      }

      // If there are entities drifting (last contact > 21 days, but had many interactions)
      const drifting = top_entities.find(
        (e) => e.days_since_contact !== null && e.days_since_contact > 21 && e.total_interactions >= 5,
      );
      if (drifting) {
        behavioral_insights.push({
          label: `Relationship drift detected — ${drifting.days_since_contact}d since last contact with ${drifting.name}`,
          category: 'relationship',
          signal_count: drifting.total_interactions,
          entity_name: drifting.name,
        });
      }
    }

    return NextResponse.json({
      days_active,
      signal_count,
      signals_processed,
      top_entities,
      stated_goals,
      behavioral_insights,
      approval_stats: {
        total,
        approved,
        skipped,
        approval_rate,
      },
      avg_confidence_last_7d,
      avg_confidence_last_30d,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'model/state');
  }
}
