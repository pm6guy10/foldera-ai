/**
 * POST /api/onboard/thin-ingest
 *
 * Called by /start/processing when the Gmail graph is too thin.
 * User pastes a Claude conversation export; we extract + re-check density.
 *
 * Threshold after both sources: patterns >= 2 → "ready" (lower bar since user
 * provided additional data). patterns < 2 → "very_thin" → capture email and exit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { apiError } from '@/lib/utils/api-error';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function checkDensity(userId: string): Promise<{ patterns: number; commitments: number }> {
  const supabase = getSupabase();

  const [entityRes, commitmentsRes] = await Promise.all([
    supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle(),
    supabase
      .from('tkg_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  const patterns = Object.keys(
    (entityRes.data?.patterns as Record<string, unknown>) ?? {},
  ).length;
  const commitments = commitmentsRes.count ?? 0;

  return { patterns, commitments };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const text: string = typeof body.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  // Extract — ignore dedup errors (user may resubmit the same paste)
  try {
    await extractFromConversation(text, userId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('already ingested')) {
      return apiError(err, 'onboard/thin-ingest');
    }
  }

  // Lower threshold after user provided both sources
  const density = await checkDensity(userId);
  const isReady = density.patterns >= 2;

  return NextResponse.json({
    status: isReady ? 'ready' : 'very_thin',
    patterns: density.patterns,
    commitments: density.commitments,
  });
}
