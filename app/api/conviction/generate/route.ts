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
import { generateDirective } from '@/lib/briefing/generator';

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
    userId = session.user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });
  }

  try {
    // Generate the directive
    const directive = await generateDirective(userId);

    // Log to tkg_actions
    const supabase = getSupabase();
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .insert({
        user_id:        userId,
        directive_text: directive.directive,
        action_type:    directive.action_type,
        confidence:     directive.confidence,
        reason:         directive.reason,
        evidence:       directive.evidence,
        status:         'pending_approval',
        generated_at:   new Date().toISOString(),
      })
      .select('id, generated_at, status')
      .single();

    if (error) {
      console.error('[conviction/generate] tkg_actions insert failed:', error.message);
      // Return directive even if logging fails
      return NextResponse.json({
        ...directive,
        id: null,
        userId,
        status: 'pending_approval',
        generatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ...directive,
      id:          action.id,
      userId,
      status:      action.status,
      generatedAt: action.generated_at,
    });
  } catch (err: any) {
    console.error('[conviction/generate]', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate directive' },
      { status: 500 }
    );
  }
}
