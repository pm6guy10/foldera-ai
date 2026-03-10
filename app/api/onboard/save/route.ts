/**
 * POST /api/onboard/save
 *
 * Public route — no auth required. Captures an email address at the end
 * of the onboarding flow and adds it to the waitlist.
 *
 * Body: { email: string; tempUserId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  let body: { email?: unknown; tempUserId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, tempUserId } = body;

  if (typeof email !== 'string' || !email.includes('@') || email.length < 5) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  if (typeof tempUserId !== 'string' || !UUID_RE.test(tempUserId)) {
    return NextResponse.json({ error: 'Invalid tempUserId' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('waitlist')
    .upsert(
      { email: email.toLowerCase().trim() },
      { onConflict: 'email', ignoreDuplicates: true }
    );

  if (error) {
    console.error('[/api/onboard/save]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
