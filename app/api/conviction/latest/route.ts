/**
 * GET /api/conviction/latest
 *
 * Returns the most recent tkg_actions row with status=pending_approval
 * for the authenticated user. Falls back to the latest row of any status
 * if nothing is pending. Returns 204 if no actions exist yet.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { apiError } from '@/lib/utils/api-error';

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
    userId = process.env.INGEST_USER_ID ?? session.user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });
  }

  try {
    const supabase = getSupabase();

    // Prefer most recent pending_approval
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!action) {
      return new NextResponse(null, { status: 204 });
    }

    // Map DB row → ConvictionAction shape
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
  } catch (err: unknown) {
    return apiError(err, 'conviction/latest');
  }
}
