/**
 * GET /api/test-waitlist
 *
 * Dev-only health check for Supabase connectivity.
 * In production always returns 404.
 * Never returns DB data, config flags, or error details to the client.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('waitlist').select('id').limit(1);

    if (error) {
      console.error('[test-waitlist]', error.message);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
