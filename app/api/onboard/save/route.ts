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
import { apiError, validationError } from '@/lib/utils/api-error';
import { onboardSaveBodySchema } from '@/lib/utils/api-schemas';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return validationError('Invalid JSON');
  }

  const parsed = onboardSaveBodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
    return validationError(msg);
  }
  const { email, tempUserId } = parsed.data;

  const supabase = getSupabase();

  const { error } = await supabase
    .from('waitlist')
    .upsert(
      { email },
      { onConflict: 'email', ignoreDuplicates: true }
    );

  if (error) {
    return apiError(error, 'onboard/save');
  }

  return NextResponse.json({ saved: true });
}
