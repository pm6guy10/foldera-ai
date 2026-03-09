/**
 * Cron: Daily Scan
 * Phase 1: scan target is conversation exports via extractFromConversation().
 * Automated ingestion runs here in Phase 2. For now, trigger manually via
 * POST /api/extraction/ingest.
 *
 * Kept as a stub so the cron infrastructure stays wired.
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('Unauthorized cron request', { requestId });
    return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
  }

  logger.info('Daily scan started (Phase 1 stub)', { requestId });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Count users with identity graph data
  const { count } = await supabase
    .from('tkg_entities')
    .select('user_id', { count: 'exact', head: true })
    .eq('name', 'self');

  // Phase 1: extraction is manual (POST /api/extraction/ingest with conversation text).
  // Phase 2: this loop will call extractFromConversation() per user
  //          using automated conversation data from connected sources.

  logger.info('Daily scan complete (Phase 1: no automated extraction)', { requestId });

  return NextResponse.json({
    requestId,
    phase: 1,
    usersWithData: count ?? 0,
    note: 'Automated extraction wires in Phase 2. Feed conversations manually via POST /api/extraction/ingest.',
  });
}
