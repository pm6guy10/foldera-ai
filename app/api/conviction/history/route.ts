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
import { ACTION_HISTORY_SELECT } from '@/lib/conviction/action-read-shapes';
import { jsonWithReadOnlyUserCache } from '@/lib/utils/read-only-user-cache';
import { deriveArtifactReadinessFromSummary } from '@/lib/conviction/artifact-readiness';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const MAX_FETCH_LIMIT = 150;
const PREVIEW_LEN = 160;

type HistoryRow = {
  id: string;
  status: string | null;
  action_type: string | null;
  confidence: number | null;
  generated_at: string | null;
  directive_text: unknown;
  artifact_preview?: unknown;
  is_no_send?: unknown;
  no_send_reason?: unknown;
};

const USER_FACING_STATUSES = new Set(['pending_approval', 'approved', 'executed', 'skipped']);

const INTERNAL_FAILURE_PATTERNS = [
  /\bGENERATION_LOOP\b/i,
  /\bAll \d+ candidates blocked\b/i,
  /\bDirective rejected by persistence validation\b/i,
  /\bOutput blocked by quality gate\b/i,
  /\bHard bottom gate blocked\b/i,
  /\bno_send(?:_persisted|_blocker|_reused)?\b/i,
  /\bmissing_[a-z_]+\b/i,
  /\bweak_[a-z_]+\b/i,
] as const;

function previewText(text: unknown): string {
  if (typeof text !== 'string' || !text.trim()) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= PREVIEW_LEN ? t : `${t.slice(0, PREVIEW_LEN)}…`;
}

function hasInternalFailureText(value: unknown): boolean {
  const text = previewText(value);
  if (!text) return false;
  return INTERNAL_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasNoSendOutcome(row: HistoryRow): boolean {
  return row.action_type === 'do_nothing' || row.is_no_send === true;
}

function isUserFacingHistoryRow(row: HistoryRow): boolean {
  if (!row.status || !USER_FACING_STATUSES.has(row.status)) return false;
  if (hasNoSendOutcome(row)) return false;
  if (hasInternalFailureText(row.directive_text)) return false;
  return true;
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
    const fetchLimit = Math.min(MAX_FETCH_LIMIT, Math.max(limit, limit * 3));
    const { data: rows, error } = await supabase
      .from('tkg_action_summaries')
      .select(ACTION_HISTORY_SELECT)
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(fetchLimit);

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }

    const items = ((rows ?? []) as HistoryRow[])
      .filter(isUserFacingHistoryRow)
      .slice(0, limit)
      .map((r) => {
        const artifact_preview = previewText(r.artifact_preview);
        const readiness = deriveArtifactReadinessFromSummary({
          action_type: r.action_type,
          artifact_preview,
          finished_artifact_verdict: artifact_preview ? 'strict_artifact_selected' : 'no_finished_artifact',
        });
        return {
          id: r.id,
          status: r.status,
          action_type: r.action_type,
          confidence: r.confidence,
          generated_at: r.generated_at,
          directive_preview: previewText(r.directive_text),
          has_artifact: artifact_preview.length > 0,
          artifact_preview,
          artifact_readiness_state: readiness.state,
        };
      });

    return jsonWithReadOnlyUserCache({ items });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/history');
  }
}
