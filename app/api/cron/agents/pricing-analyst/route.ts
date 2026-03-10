/**
 * Cron route — Pricing Analyst agent
 * Schedule: weekly on Monday at 10:00 AM
 * Vercel Cron: 0 10 * * 1
 */

import { NextResponse } from 'next/server';
import { runPricingAnalyst } from '@/lib/agents/pricing-analyst';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not set' }, { status: 500 });
  }

  try {
    const drafted = await runPricingAnalyst(userId);
    console.log(`[cron/pricing-analyst] drafted ${drafted} findings`);
    return NextResponse.json({ ok: true, agent: 'pricing-analyst', drafted });
  } catch (err: any) {
    console.error('[cron/pricing-analyst] failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
