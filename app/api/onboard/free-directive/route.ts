/**
 * POST /api/onboard/free-directive
 *
 * Generates the one-time free directive for a new onboarding user.
 *
 * Rules:
 *  - Returns 409 if free_directive_used is already true for this user.
 *  - Calls generateDirective(userId), persists to tkg_actions.
 *  - Upserts tkg_user_meta: marks used, sets graph_expires_at = now + 7 days.
 *  - Returns { directive: ConvictionDirective }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { createServerClient } from '@/lib/db/client';


export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = createServerClient();

  // ── Guard: one free directive per user ──────────────────────────────────
  const { data: meta } = await supabase
    .from('tkg_user_meta')
    .select('free_directive_used, free_directive_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (meta?.free_directive_used) {
    return NextResponse.json(
      { error: 'Free directive already used', usedDate: meta.free_directive_date },
      { status: 409 },
    );
  }

  // ── Generate directive + artifact (no directive-only to-dos) ─────────────
  const directive = await generateDirective(userId);
  let artifact: Awaited<ReturnType<typeof generateArtifact>> | null = null;
  try {
    artifact = await generateArtifact(userId, directive);
  } catch (err) {
    console.warn('[free-directive] artifact generation failed:', err);
  }

  // ── Persist to tkg_actions with execution_result.artifact ────────────────
  const { data: action } = await supabase
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
      execution_result: artifact ? { artifact } : null,
    })
    .select('id')
    .single();

  // ── Mark free directive used + set 7-day trial expiry ───────────────────
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await supabase.from('tkg_user_meta').upsert(
    {
      user_id:              userId,
      free_directive_used:  true,
      free_directive_date:  now.toISOString(),
      graph_expires_at:     sevenDaysLater.toISOString(),
      updated_at:           now.toISOString(),
    },
    { onConflict: 'user_id' },
  );

  return NextResponse.json({ directive, actionId: action?.id ?? null });
}
