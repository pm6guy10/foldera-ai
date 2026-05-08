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
const MAX_FETCH_LIMIT = 150;
const PREVIEW_LEN = 160;

type HistoryRow = {
  id: string;
  status: string | null;
  action_type: string | null;
  confidence: number | null;
  generated_at: string | null;
  directive_text: unknown;
  artifact?: unknown;
  execution_result?: unknown;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstPreviewableString(values: unknown[]): string {
  for (const value of values) {
    const preview = previewText(value);
    if (preview) return preview;
  }
  return '';
}

function hasInternalFailureText(value: unknown): boolean {
  const text = previewText(value);
  if (!text) return false;
  return INTERNAL_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasNoSendOutcome(row: HistoryRow): boolean {
  if (row.action_type === 'do_nothing') return true;

  const executionResult = asRecord(row.execution_result);
  if (!executionResult) return false;

  if (executionResult.outcome_type === 'no_send') return true;
  if (executionResult.no_send === true || asRecord(executionResult.no_send)) return true;

  const generationLog = asRecord(executionResult.generation_log);
  return generationLog?.outcome === 'no_send';
}

function isUserFacingHistoryRow(row: HistoryRow): boolean {
  if (!row.status || !USER_FACING_STATUSES.has(row.status)) return false;
  if (hasNoSendOutcome(row)) return false;
  if (hasInternalFailureText(row.directive_text)) return false;
  return true;
}

function readArtifactFromRow(row: HistoryRow): unknown {
  const executionResult = asRecord(row.execution_result);
  const executionArtifact = asRecord(executionResult?.artifact);
  const columnArtifact = asRecord(row.artifact);
  if (executionArtifact || columnArtifact) {
    return { ...(executionArtifact ?? {}), ...(columnArtifact ?? {}) };
  }
  return row.artifact ?? executionResult?.artifact;
}

function artifactPreview(artifactValue: unknown): string {
  const artifact = asRecord(artifactValue);
  if (!artifact) return previewText(artifactValue);

  const headline = firstPreviewableString([
    artifact.title,
    artifact.subject,
    artifact.heading,
    artifact.type,
  ]);
  const body = firstPreviewableString([
    artifact.body,
    artifact.content,
    artifact.text,
    artifact.context,
    artifact.summary,
    artifact.description,
    artifact.message,
    artifact.draft,
  ]);

  return previewText([headline, body].filter(Boolean).join(' - '));
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
      .from('tkg_actions')
      .select('id, status, action_type, confidence, generated_at, directive_text, artifact, execution_result')
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
        const artifact_preview = artifactPreview(readArtifactFromRow(r));
        return {
          id: r.id,
          status: r.status,
          action_type: r.action_type,
          confidence: r.confidence,
          generated_at: r.generated_at,
          directive_preview: previewText(r.directive_text),
          has_artifact: artifact_preview.length > 0,
          artifact_preview,
        };
      });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/history');
  }
}
