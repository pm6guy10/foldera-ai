import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerClient();

  // DB check
  let dbOk = false;
  try {
    const { error } = await supabase.from('tkg_goals').select('id').limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  // Env check
  const envOk = !!(
    process.env.ANTHROPIC_API_KEY &&
    process.env.RESEND_API_KEY &&
    process.env.ENCRYPTION_KEY
  );

  const status = dbOk && envOk ? 'ok' : 'degraded';

  return NextResponse.json({
    status,
    ts: new Date().toISOString(),
    db: dbOk,
    env: envOk,
  });
}
