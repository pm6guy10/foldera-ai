/**
 * GET /api/conviction/history?limit=30
 *
 * Recent tkg_actions for the signed-in user (newest first). Summary fields only —
 * no full artifact bodies in the list payload (dashboard detail stays on /dashboard).
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const PREVIEW_LEN = 160;

function previewText(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= PREVIEW_LEN ? t : `${t.slice(0, PREVIEW_LEN)}…`;
}

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const raw = parseInt(searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(raw)
    ? Math.min(MAX_LIMIT, Math.max(1, raw))
    : DEFAULT_LIMIT;

  try {
    const supabase = createServerClient();
    const { data: rows, error } = await supabase
      .from('tkg_actions')
      .select('id, status, action_type, confidence, generated_at, directive_text')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }

    const items = (rows ?? []).map((r) => ({
      id: r.id,
      status: r.status,
      action_type: r.action_type,
      confidence: r.confidence,
      generated_at: r.generated_at,
      directive_preview: previewText(r.directive_text),
    }));

    return NextResponse.json({ items });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/history');
  }
}
