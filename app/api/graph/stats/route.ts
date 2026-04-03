/**
 * GET /api/graph/stats
 *
 * Returns identity-graph counts for the dashboard metrics row.
 * Does NOT trigger Claude generation — pure DB reads only.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  // Auth
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const supabase = createServerClient();

    const [signalsRes, commitmentsRes, entityRes, latestSignalRes] = await Promise.all([
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

      supabase
        .from('tkg_signals')
        .select('occurred_at, source')
        .eq('user_id', userId)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const queryError = signalsRes.error
      ?? commitmentsRes.error
      ?? entityRes.error
      ?? latestSignalRes.error;

    if (queryError) {
      throw queryError;
    }

    return NextResponse.json({
      signalsTotal:      signalsRes.count ?? 0,
      commitmentsActive: commitmentsRes.count ?? 0,
      patternsActive:    Object.keys(
        (entityRes.data?.patterns as Record<string, unknown>) ?? {}
      ).length,
      lastSignalAt:      latestSignalRes.data?.occurred_at ?? null,
      lastSignalSource:  latestSignalRes.data?.source ?? null,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'graph/stats');
  }
}
