/**
 * GET /api/conviction/latest
 *
 * Returns the most recent tkg_actions row for the authenticated user,
 * preferring status=pending_approval, then falling back to the latest row overall.
 * Returns null (204) if no actions exist yet.
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

  // Prefer most recent pending_approval; fall back to any latest action
  const { data: pending } = await supabase
    .from('tkg_actions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending_approval')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const action = pending ?? null;

  if (!action) {
    // No actions at all — return 204 so the client knows gracefully
    return new NextResponse(null, { status: 204 });
  }

  // Map DB row → ConvictionAction shape the card expects
  return NextResponse.json({
    id:              action.id,
    userId,
    directive:       action.directive_text,
    action_type:     action.action_type,
    confidence:      action.confidence,
    reason:          action.reason,
    evidence:        action.evidence ?? [],
    status:          action.status,
    generatedAt:     action.generated_at,
    approvedAt:      action.approved_at ?? undefined,
    executedAt:      action.executed_at ?? undefined,
    executionResult: action.execution_result ?? undefined,
  });
}
