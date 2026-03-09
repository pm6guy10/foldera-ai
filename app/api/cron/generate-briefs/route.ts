/**
 * Cron: Generate Chief-of-Staff Briefs
 * Replaces processMeetingBriefs() with generateBriefing() per pivot spec.
 * Runs for all users who have a 'self' entity in tkg_entities.
 *
 * Vercel cron schedule: see vercel.json
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBriefing } from '@/lib/briefing/generator';

export const dynamic = 'force-dynamic';

async function handleCronJob(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find all users who have a self entity (have fed data into the graph)
  const { data: selfEntities, error } = await supabase
    .from('tkg_entities')
    .select('user_id')
    .eq('name', 'self');

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch users', detail: error.message }, { status: 500 });
  }

  const userIds = [...new Set((selfEntities ?? []).map(e => e.user_id as string))];

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      await generateBriefing(userId);
      results.push({ userId, success: true });
    } catch (err: any) {
      results.push({ userId, success: false, error: err.message });
    }
  }

  return NextResponse.json({
    success: true,
    briefs_generated: results.filter(r => r.success).length,
    errors: results.filter(r => !r.success),
  });
}

export const GET = handleCronJob;
export const POST = handleCronJob;
