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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractArtifact(row: Record<string, unknown>): Record<string, unknown> | null {
  const executionResult = asObject(row.execution_result);
  const executionArtifact = asObject(executionResult?.artifact);
  const artifact = asObject(row.artifact);
  const merged = { ...(executionArtifact ?? {}), ...(artifact ?? {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

function extractArtifactPreview(artifact: Record<string, unknown> | null): string {
  if (!artifact) return '';
  const preview = ['body', 'text', 'content', 'markdown', 'summary', 'recommendation']
    .map((key) => artifact[key])
    .find((value) => typeof value === 'string' && value.trim().length > 0);
  return previewText(preview);
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
      .select('id, status, action_type, confidence, generated_at, directive_text, artifact, execution_result')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }

    const items = (rows ?? []).map((r) => {
      const artifact = extractArtifact(r as Record<string, unknown>);
      const artifactPreview = extractArtifactPreview(artifact);
      return {
      id: r.id,
      status: r.status,
      action_type: r.action_type,
      confidence: r.confidence,
      generated_at: r.generated_at,
      directive_preview: previewText(r.directive_text),
      has_artifact: Boolean(artifact),
      artifact_preview: artifactPreview,
      };
    });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/history');
  }
}
