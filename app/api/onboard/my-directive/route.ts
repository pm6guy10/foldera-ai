/**
 * GET /api/onboard/my-directive
 *
 * Returns the most recent free directive for the authenticated user,
 * plus the usedDate from tkg_user_meta (so the result page can show
 * "Your directive was generated on [date]. Subscribe to continue.").
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = getSupabase();

  const [actionRes, metaRes] = await Promise.all([
    supabase
      .from('tkg_actions')
      .select('directive_text, action_type, confidence, reason, evidence, generated_at')
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('tkg_user_meta')
      .select('free_directive_date')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const row = actionRes.data;

  const directive = row
    ? {
        directive:   row.directive_text,
        action_type: row.action_type,
        confidence:  row.confidence,
        reason:      row.reason,
        evidence:    row.evidence ?? [],
      }
    : null;

  return NextResponse.json({
    directive,
    usedDate: metaRes.data?.free_directive_date ?? null,
  });
}
