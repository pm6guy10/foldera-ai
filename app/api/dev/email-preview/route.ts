/**
 * GET /api/dev/email-preview
 * GET /api/dev/email-preview?variant=nothing
 * GET /api/dev/email-preview?action_id=<uuid>
 *
 * Renders the daily-brief Resend HTML in the browser (no send).
 * Requires ALLOW_DEV_ROUTES=true (local / dev). Returns 404 when unset.
 *
 * Live preview: after POST /api/dev/brain-receipt, open same origin:
 *   /api/dev/email-preview?action_id=<final_action.action_id>
 * (session cookie required; owner-only.)
 */

import { NextResponse } from 'next/server';
import {
  buildDailyDirectiveEmailHtml,
  DEV_EMAIL_PREVIEW_SAMPLE_DIRECTIVE,
  type DirectiveItem,
} from '@/lib/email/resend';
import { resolveUser, isValidUuid } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import type { ConvictionArtifact } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

function mergeActionArtifact(action: Record<string, unknown>): ConvictionArtifact | null {
  const colArtifact =
    action.artifact && typeof action.artifact === 'object'
      ? (action.artifact as Record<string, unknown>)
      : {};
  const executionResult =
    action.execution_result && typeof action.execution_result === 'object'
      ? (action.execution_result as Record<string, unknown>)
      : null;
  const erArtifact =
    executionResult?.artifact && typeof executionResult.artifact === 'object'
      ? (executionResult.artifact as Record<string, unknown>)
      : {};
  const merged = { ...erArtifact, ...colArtifact };
  if (Object.keys(merged).length === 0) return null;
  return merged as unknown as ConvictionArtifact;
}

export async function GET(request: Request) {
  if (process.env.ALLOW_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const variant = url.searchParams.get('variant');
  const actionIdRaw = url.searchParams.get('action_id');
  const actionId = actionIdRaw?.trim() ?? '';

  let directive: DirectiveItem | null;
  let date: string;

  if (actionId) {
    if (!isValidUuid(actionId)) {
      return NextResponse.json({ error: 'Invalid action_id' }, { status: 400 });
    }

    const auth = await resolveUser(request);
    if (auth instanceof NextResponse) return auth;
    if (auth.userId !== OWNER_USER_ID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServerClient();
    const { data: row, error } = await supabase
      .from('tkg_actions')
      .select(
        'id, user_id, generated_at, action_type, directive_text, reason, confidence, artifact, execution_result',
      )
      .eq('id', actionId)
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    const action = row as Record<string, unknown>;
    const genAt =
      typeof action.generated_at === 'string' ? action.generated_at : new Date().toISOString();
    date = genAt.slice(0, 10);
    const reasonRaw = typeof action.reason === 'string' ? action.reason : '';
    const mergedArtifact = mergeActionArtifact(action);
    directive = {
      id: action.id as string,
      directive: (action.directive_text as string) ?? '',
      action_type: (action.action_type as string) ?? 'do_nothing',
      confidence: typeof action.confidence === 'number' ? action.confidence : 0,
      reason: reasonRaw.split('[score=')[0].trim(),
      artifact: mergedArtifact,
    };
  } else {
    directive = variant === 'nothing' ? null : DEV_EMAIL_PREVIEW_SAMPLE_DIRECTIVE;
    date = new Date().toISOString().slice(0, 10);
  }

  const html = buildDailyDirectiveEmailHtml({
    baseUrl: origin,
    date,
    directive,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
