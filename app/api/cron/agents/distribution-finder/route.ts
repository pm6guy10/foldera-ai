/**
 * Cron route — Distribution Finder agent
 * Schedule: daily at 9:15 AM (after social scanner has run at 8:00 AM)
 * Vercel Cron: 15 9 * * *
 */

import { NextResponse } from 'next/server';
import { runDistributionFinder } from '@/lib/agents/distribution-finder';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  try {
    const drafted = await runDistributionFinder(userId);
    console.log(`[cron/distribution-finder] drafted ${drafted} opportunities`);
    return NextResponse.json({ ok: true, agent: 'distribution-finder', drafted });
  } catch (err: any) {
    console.error('[cron/distribution-finder] failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
