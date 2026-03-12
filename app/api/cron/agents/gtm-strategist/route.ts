/**
 * Cron route — GTM Strategist agent
 * Schedule: daily at 9:05 AM
 * Vercel Cron: 5 9 * * *
 */

import { NextResponse } from 'next/server';
import { apiError } from '@/lib/utils/api-error';
import { runGtmStrategist } from '@/lib/agents/gtm-strategist';

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
    const drafted = await runGtmStrategist(userId);
    console.log(`[cron/gtm-strategist] drafted ${drafted} actions`);
    return NextResponse.json({ ok: true, agent: 'gtm-strategist', drafted });
  } catch (err: unknown) {
    return apiError(err, 'cron/gtm-strategist');
  }
}
