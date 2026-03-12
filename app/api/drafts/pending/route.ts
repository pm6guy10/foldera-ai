/**
 * GET /api/drafts/pending
 *
 * Returns all tkg_actions rows with status='draft' for the authenticated user,
 * ordered newest first. Used by the DraftQueue component to poll for pending
 * proposals.
 *
 * Returns: DraftAction[]
 *
 * Auth: session OR x-ingest-secret header.
 */

import { createServerClient } from '@/lib/db/client';
import { NextResponse }     from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions }   from '@/lib/auth/auth-options';
import { apiError }        from '@/lib/utils/api-error';
import type { DraftAction, ActionType } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let userId: string | undefined;
  const ingestSecret = request.headers.get('x-ingest-secret');
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
  if (!userId) return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });

  // ── Query ───────────────────────────────────────────────────────────────────
  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('tkg_actions')
    .select('id, directive_text, action_type, reason, execution_result, generated_at')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('generated_at', { ascending: false })
    .limit(20);

  if (error) {
    return apiError(error, 'drafts/pending');
  }

  // ── Map rows → DraftAction ──────────────────────────────────────────────────
  const drafts: DraftAction[] = (rows ?? []).map(row => {
    const result = (row.execution_result ?? {}) as Record<string, unknown>;
    const { _title, _source, ...draft } = result;
    return {
      id:          row.id,
      title:       String(_title ?? row.reason ?? 'Draft action'),
      description: String(row.directive_text ?? ''),
      action_type: row.action_type as ActionType,
      draft:       draft as DraftAction['draft'],
      generatedAt: row.generated_at,
    };
  });

  return NextResponse.json(drafts);
}
