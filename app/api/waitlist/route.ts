/**
 * POST /api/waitlist
 *
 * Body:   { email: string }
 * 200:    { success: true }
 * 400:    { error: "Valid email required" }
 * 409:    { error: "You're already on the list" }
 * 500:    { error: "Something went wrong" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = typeof body.email === 'string' ? body.email.trim() : '';
  const email = raw.toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('waitlist').insert({ email });

  if (error) {
    // Postgres unique_violation
    if (error.code === '23505') {
      return NextResponse.json(
        { error: "You're already on the list" },
        { status: 409 }
      );
    }
    console.error('[POST /api/waitlist]', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
