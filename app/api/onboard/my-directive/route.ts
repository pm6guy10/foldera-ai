/**
 * GET /api/onboard/my-directive
 *
 * Returns the most recent free directive for the authenticated user,
 * plus the usedDate from tkg_user_meta (so the result page can show
 * "Your directive was generated on [date]. Subscribe to continue.").
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';


export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    const supabase = createServerClient();

    const { data: meta, error: metaError } = await supabase
      .from('tkg_user_meta')
      .select('free_directive_date')
      .eq('user_id', userId)
      .maybeSingle();

    if (metaError) {
      return apiError(metaError, 'onboard/my-directive');
    }

    const usedDate = meta?.free_directive_date ?? null;
    if (!usedDate) {
      return NextResponse.json({ directive: null, usedDate: null });
    }

    const { data: row, error: actionError } = await supabase
      .from('tkg_actions')
      .select('directive_text, action_type, confidence, reason, evidence, generated_at')
      .eq('user_id', userId)
      .lte('generated_at', usedDate)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (actionError) {
      return apiError(actionError, 'onboard/my-directive');
    }

    const directive = row
      ? {
          directive: row.directive_text,
          action_type: row.action_type,
          confidence: row.confidence,
          reason: row.reason,
          evidence: row.evidence ?? [],
        }
      : null;

    return NextResponse.json({
      directive,
      usedDate,
    });
  } catch (err: unknown) {
    return apiError(err, 'onboard/my-directive');
  }
}
