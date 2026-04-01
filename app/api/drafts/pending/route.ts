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
import { resolveUser } from '@/lib/auth/resolve-user';
import { NextResponse }     from 'next/server';
import { apiError }        from '@/lib/utils/api-error';
import type { DraftAction, ActionType } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const scope = new URL(request.url).searchParams.get('scope');

  // ── Query ───────────────────────────────────────────────────────────────────
  const supabase = createServerClient();
  let q = supabase
    .from('tkg_actions')
    .select('id, directive_text, action_type, reason, execution_result, generated_at, action_source')
    .eq('user_id', userId)
    .eq('status', 'draft')
    .order('generated_at', { ascending: false })
    .limit(20);

  if (scope === 'system') {
    q = q.not('action_source', 'is', null).like('action_source', 'agent_%');
  } else if (scope === 'user') {
    q = q.is('action_source', null);
  }

  const { data: rows, error } = await q;

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
