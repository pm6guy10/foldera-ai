/**
 * Cron route — Trust Auditor agent
 * Schedule: daily at 9:10 AM
 * Vercel Cron: 10 9 * * *
 */

import { NextResponse } from 'next/server';
import { runTrustAuditor } from '@/lib/agents/trust-auditor';

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
    const drafted = await runTrustAuditor(userId);
    console.log(`[cron/trust-auditor] drafted ${drafted} findings`);
    return NextResponse.json({ ok: true, agent: 'trust-auditor', drafted });
  } catch (err: any) {
    console.error('[cron/trust-auditor] failed:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
