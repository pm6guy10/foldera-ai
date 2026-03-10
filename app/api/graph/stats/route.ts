/**
 * GET /api/graph/stats
 *
 * Returns identity-graph counts for the dashboard metrics row.
 * Does NOT trigger Claude generation — pure DB reads only.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { getAuthOptions } from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  // Auth
  let userId: string | undefined;
  const ingestSecret = (request as any).headers?.get
    ? (request as any).headers.get('x-ingest-secret')
    : null;
  if (ingestSecret) {
    if (ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: 'Invalid ingest secret' }, { status: 401 });
    }
    userId = process.env.INGEST_USER_ID;
  } else {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = session.user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });
  }

  const supabase = getSupabase();

  const [signalsRes, commitmentsRes, entityRes] = await Promise.all([
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

  return NextResponse.json({
    signalsTotal:      signalsRes.count ?? 0,
    commitmentsActive: commitmentsRes.count ?? 0,
    patternsActive:    Object.keys(
      (entityRes.data?.patterns as Record<string, unknown>) ?? {}
    ).length,
  });
}
