/**
 * POST /api/growth/visit
 *
 * Called by the client when a visitor arrives with a ref/UTM param.
 * Logs the visit as a tkg_signal for conversion tracking.
 *
 * Body: { ref: string, path: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { logGrowthVisit } from '@/lib/growth/conversion-tracker';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ref  = typeof body.ref === 'string' ? body.ref.trim() : '';
    const path = typeof body.path === 'string' ? body.path : '/';

    if (!ref) {
      return NextResponse.json({ error: 'ref required' }, { status: 400 });
    }

    await logGrowthVisit({
      ref,
      path,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/growth/visit]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
