/**
 * GET /api/cron/cleanup-trials
 *
 * Runs daily at 4 AM. Deletes all graph data for onboarding trial users
 * whose graph_expires_at has passed (i.e., they didn't subscribe within 7 days).
 *
 * We promised: "Nothing is stored permanently until you subscribe."
 *
 * Tables cleaned: tkg_signals, tkg_commitments, tkg_entities, tkg_goals,
 *                 tkg_actions, tkg_patterns, tkg_briefings, tkg_user_meta
 *
 * Users with graph_expires_at IS NULL are permanent (subscribed) — never touched.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';


export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this header automatically)
  const authErr = validateCronAuth(req as Request);
  if (authErr) return authErr;

  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Find expired trial user IDs
  const { data: expired, error: metaErr } = await supabase
    .from('tkg_user_meta')
    .select('user_id')
    .not('graph_expires_at', 'is', null)
    .lte('graph_expires_at', now);

  if (metaErr) {
    return apiError(metaErr, 'cron/cleanup-trials');
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ deleted: 0, message: 'No expired trials found' });
  }

  const userIds = expired.map(r => r.user_id);
  console.log(`[cleanup-trials] deleting data for ${userIds.length} expired trial users`);

  // Delete in order (foreign key constraints — signals first, then entities)
  const tables = [
    'tkg_signals',
    'tkg_commitments',
    'tkg_goals',
    'tkg_actions',
    'tkg_briefings',
    'tkg_entities',
    'tkg_patterns',
  ];

  const errors: string[] = [];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .in('user_id', userIds);
    if (error) {
      errors.push(`${table}: ${error.message}`);
    }
  }

  // Finally remove their meta rows
  await supabase
    .from('tkg_user_meta')
    .delete()
    .in('user_id', userIds);

  if (errors.length > 0) {
    console.error('[cleanup-trials] some deletions failed:', errors);
  }

  return NextResponse.json({
    deleted: userIds.length,
    errorCount: errors.length,
  });
}
