/**
 * POST /api/drafts/propose
 *
 * Creates a draft action staged for user approval.
 * Called programmatically by crons (sync-email, etc.) or by future automation.
 *
 * Body:
 *   title       string   — Short label: "Reply to Alice re: proposal"
 *   description string   — One-sentence: "Foldera wants to send this email"
 *   action_type string   — ActionType ('send_message' | 'schedule' | ...)
 *   draft       object   — The concrete payload (to, subject, body, ...)
 *   source?     string   — Where this originated ('email_sync', 'cron', ...)
 *
 * Returns: { id, title, description, action_type, draft, generatedAt }
 *
 * Auth: session OR x-ingest-secret header (for cron callers).
 */

import { NextResponse }     from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient }     from '@supabase/supabase-js';
import { getAuthOptions }   from '@/lib/auth/auth-options';
import { apiError }        from '@/lib/utils/api-error';
import type { ActionType }  from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

const VALID_ACTION_TYPES: ActionType[] = [
  'write_document', 'send_message', 'make_decision', 'do_nothing', 'schedule', 'research',
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
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

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, description, action_type, draft, source } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!description || typeof description !== 'string') {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (!action_type || !VALID_ACTION_TYPES.includes(action_type as ActionType)) {
    return NextResponse.json(
      { error: `action_type must be one of: ${VALID_ACTION_TYPES.join(', ')}` },
      { status: 400 },
    );
  }
  if (!draft || typeof draft !== 'object') {
    return NextResponse.json({ error: 'draft payload is required' }, { status: 400 });
  }

  // ── Insert ──────────────────────────────────────────────────────────────────
  const supabase = getSupabase();
  const { data: row, error } = await supabase
    .from('tkg_actions')
    .insert({
      user_id:        userId,
      directive_text: description,
      action_type,
      confidence:     0,
      reason:         title,
      evidence:       [],
      status:         'draft',
      generated_at:   new Date().toISOString(),
      execution_result: {
        ...(draft as Record<string, unknown>),
        _title:  title,
        _source: source ?? 'api',
      },
    })
    .select('id, generated_at')
    .single();

  if (error) {
    return apiError(error, 'drafts/propose');
  }

  return NextResponse.json({
    id:          row.id,
    title,
    description,
    action_type,
    draft,
    generatedAt: row.generated_at,
  }, { status: 201 });
}
