/**
 * POST /api/conviction/generate
 *
 * Runs the full conviction pipeline:
 * 1. Pull signals + commitments + goals + patterns
 * 2. Call generateDirective() → single directive
 * 3. Log result to tkg_actions with status=pending_approval
 * 4. Return the ConvictionAction to the client
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { apiError } from '@/lib/utils/api-error';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  // Auth — session or ingest secret
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

  if (!userId) {
    return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });
  }

  try {
    // Generate the directive
    const directive = await generateDirective(userId);

    // Generate the artifact (finished work product)
    let artifact = null;
    try {
      artifact = await generateArtifact(userId, directive);
    } catch (artErr: any) {
      console.warn('[conviction/generate] artifact generation failed:', artErr.message);
    }

    // Log to tkg_actions
    const supabase = getSupabase();
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .insert({
        user_id:          userId,
        directive_text:   directive.directive,
        action_type:      directive.action_type,
        confidence:       directive.confidence,
        reason:           directive.reason,
        evidence:         directive.evidence,
        status:           'pending_approval',
        generated_at:     new Date().toISOString(),
        execution_result: artifact ? { artifact } : null,
      })
      .select('id, generated_at, status, execution_result')
      .single();

    if (error) {
      return apiError(error, 'conviction/generate');
    }

    return NextResponse.json({
      ...directive,
      id:              action.id,
      userId,
      status:          action.status,
      generatedAt:     action.generated_at,
      executionResult: action.execution_result,
    });
  } catch (err: unknown) {
    return apiError(err, 'conviction/generate');
  }
}
