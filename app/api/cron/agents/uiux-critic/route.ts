/**
 * Cron route — UI/UX Critic agent
 * Schedule: daily at 9:00 AM
 * Vercel Cron: 0 9 * * *
 */

import { NextResponse } from 'next/server';
import { apiError } from '@/lib/utils/api-error';
import { runUiUxCritic } from '@/lib/agents/uiux-critic';

export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify this is a legitimate cron invocation
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  try {
    const drafted = await runUiUxCritic(userId);
    console.log(`[cron/uiux-critic] drafted ${drafted} findings`);
    return NextResponse.json({ ok: true, agent: 'uiux-critic', drafted });
  } catch (err: unknown) {
    return apiError(err, 'cron/uiux-critic');
  }
}
