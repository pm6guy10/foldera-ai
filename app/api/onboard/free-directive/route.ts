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
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = getSupabase();

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

  // ── Generate directive ───────────────────────────────────────────────────
  const directive = await generateDirective(userId);

  // ── Persist to tkg_actions ───────────────────────────────────────────────
  const { data: action } = await supabase
    .from('tkg_actions')
    .insert({
      user_id:       userId,
      directive_text: directive.directive,
      action_type:   directive.action_type,
      confidence:    directive.confidence,
      reason:        directive.reason,
      evidence:      directive.evidence,
      status:        'pending_approval',
      generated_at:  new Date().toISOString(),
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
