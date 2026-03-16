/**
 * POST /api/onboard/directive
 *
 * Public route — no auth required. Runs the conviction engine for a
 * tempUserId and returns the first directive. Logs the result to
 * tkg_actions so it survives if the user later signs up.
 *
 * Body: { tempUserId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export async function POST(request: NextRequest) {
  let body: { tempUserId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tempUserId } = body;

  if (typeof tempUserId !== 'string' || !UUID_RE.test(tempUserId)) {
    return NextResponse.json({ error: 'Invalid tempUserId' }, { status: 400 });
  }

  try {
    const directive = await generateDirective(tempUserId);
    if (directive.directive === '__GENERATION_FAILED__') {
      return NextResponse.json(
        { error: 'Directive generation failed' },
        { status: 500 },
      );
    }

    let artifact: Awaited<ReturnType<typeof generateArtifact>> | null = null;
    try {
      artifact = await generateArtifact(tempUserId, directive);
    } catch {
      // Fall through to the explicit null-artifact guard below.
    }

    if (!artifact) {
      return NextResponse.json(
        { error: 'Artifact generation failed' },
        { status: 500 },
      );
    }

    const supabase = createServerClient();
    const { error } = await supabase.from('tkg_actions').insert({
      user_id: tempUserId,
      directive_text: directive.directive,
      action_type: directive.action_type,
      confidence: directive.confidence,
      reason: directive.reason,
      evidence: directive.evidence,
      status: 'pending_approval',
      execution_result: { artifact },
    });
    if (error) {
      return apiError(error, 'onboard/directive');
    }

    return NextResponse.json(directive);
  } catch (err: unknown) {
    return apiError(err, 'onboard/directive');
  }
}
