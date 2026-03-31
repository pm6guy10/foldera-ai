/**
 * GET /api/briefing/latest
 *
 * DEPRECATED — tkg_briefings is no longer populated by the pipeline.
 * The active pipeline persists directives to tkg_actions; the dashboard
 * reads from /api/conviction/latest instead.
 *
 * This stub returns 501 so callers get an explicit signal rather than
 * silently reading a stale table.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/conviction/latest.' },
    { status: 501 },
  );
}
