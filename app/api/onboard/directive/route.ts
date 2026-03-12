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
import { createClient } from '@supabase/supabase-js';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
    let artifact: Awaited<ReturnType<typeof generateArtifact>> | null = null;
    try {
      artifact = await generateArtifact(tempUserId, directive);
    } catch {
      // Fallback handled inside generateArtifact; persist with or without artifact
    }

    const supabase = getSupabase();
    await supabase.from('tkg_actions').insert({
      user_id: tempUserId,
      directive_text: directive.directive,
      action_type: directive.action_type,
      confidence: directive.confidence,
      reason: directive.reason,
      evidence: directive.evidence,
      status: 'pending_approval',
      execution_result: artifact ? { artifact } : null,
    });

    return NextResponse.json(directive);
  } catch (err: unknown) {
    return apiError(err, 'onboard/directive');
  }
}
