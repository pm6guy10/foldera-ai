/**
 * GET /api/briefing/latest
 *
 * Returns today's chief-of-staff brief for the authenticated user.
 * Reads from tkg_briefings if today's record exists; otherwise generates fresh.
 * Also returns identity-graph stats for the dashboard metrics row.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';
import { generateBriefing } from '@/lib/briefing/generator';

export const dynamic = 'force-dynamic';


function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  // Resolve userId — from session or ingest secret (for CLI/script access)
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const supabase = createServerClient();

  // Query today's brief + graph stats in parallel
  const [briefRow, signalsCount, commitmentsCount, entityRow] = await Promise.all([
    supabase
      .from('tkg_briefings')
      .select('top_insight, confidence, recommended_action, stats, generated_at, briefing_date')
      .eq('user_id', userId)
      .eq('briefing_date', today())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('tkg_signals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabase
      .from('tkg_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['active', 'at_risk']),

    supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle(),
  ]);

  const graphStats = {
    signalsTotal: signalsCount.count ?? 0,
    commitmentsActive: commitmentsCount.count ?? 0,
    patternsActive: Object.keys(
      (entityRow.data?.patterns as Record<string, unknown>) ?? {}
    ).length,
  };

  // Return cached brief if available
  if (briefRow.data) {
    const row = briefRow.data;
    const statsJson = row.stats as Record<string, unknown> | null;
    return NextResponse.json({
      topInsight: row.top_insight,
      confidence: row.confidence,
      recommendedAction: row.recommended_action,
      fullBrief: (statsJson?.fullBrief as string) ?? '',
      generatedAt: row.generated_at,
      briefingDate: row.briefing_date,
      graphStats,
    });
  }

  // Nothing cached — generate fresh
  try {
    const brief = await generateBriefing(userId);
    return NextResponse.json({
      topInsight: brief.topInsight,
      confidence: brief.confidence,
      recommendedAction: brief.recommendedAction,
      fullBrief: brief.fullBrief,
      generatedAt: brief.generatedAt,
      briefingDate: brief.briefingDate,
      graphStats,
    });
  } catch (err: unknown) {
    return apiError(err, 'briefing/latest');
  }
}
