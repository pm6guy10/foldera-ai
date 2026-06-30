// Seeds workday_presence_state from the REAL generated move — not just the scored title.
//
// Why this exists: scoring alone produces a title ("Commitment due in 0d: ..."). Wrapping
// that title in "Review and take the smallest next step: <title>" is not a move — it's the
// title echoed back. The brain's actual job is to decide WHAT TO DO and draft it. So this
// route runs the full generator (score → directive → artifact) and seeds the card with the
// real plain-English move + grounded reason + the drafted artifact behind "View Draft".
//
// The scoring/seeding logic lives in lib/workday-presence/seed-from-scorer-core.ts so it can
// be invoked on-demand (sync-now) and from the cron pipeline with just a userId. This route
// is the HTTP wrapper: auth + the auth-failed trace + error mapping.
//
// resolveAnyUser: CRON_SECRET callers resolve to FOLDERA_SELF_USER_ID (owner self-loop);
// browser-session callers resolve to their own userId (non-owner paid loop — issue #259).
import { NextResponse } from 'next/server';
import { isCronAuthenticated, resolveAnyUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { seedFromScorerForUser } from '@/lib/workday-presence/seed-from-scorer-core';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await resolveAnyUser(request);
  if (auth instanceof NextResponse) {
    const fallbackUserId = process.env.FOLDERA_SELF_USER_ID?.trim();
    if (fallbackUserId) {
      try {
        const supabase = createServerClient();
        await supabase.auth.admin.updateUserById(fallbackUserId, {
          user_metadata: {
            workday_presence_suppression_trace: {
              trace_type: 'auth_failed',
              gate: 'auth_failed',
              blocker_reason:
                'seed-from-scorer: auth resolution failed — check FOLDERA_SELF_USER_ID/INGEST_USER_ID in Vercel env',
              no_send: true,
            },
          },
        });
      } catch { /* suppress — already in error path */ }
    }
    return auth;
  }

  try {
    // The scheduled system (morning-pipeline's forwarded stage call, or any future direct
    // CRON_SECRET caller) never competes with the owner's interactive manual-call budget —
    // see seedFromScorerForUser's isCronTriggered jsdoc.
    const outcome = await seedFromScorerForUser(auth.userId, 'seed_from_scorer', {
      isCronTriggered: isCronAuthenticated(request),
    });
    return NextResponse.json(outcome.payload);
  } catch (error: unknown) {
    try {
      const supabase = createServerClient();
      await supabase.auth.admin.updateUserById(auth.userId, {
        user_metadata: {
          workday_presence_suppression_trace: {
            trace_type: 'generation_failed',
            gate: 'generation_failed',
            blocker_reason: `seed-from-scorer: unhandled crash — ${error instanceof Error ? error.message : String(error)}`,
            generation_failed: true,
            no_send: true,
          },
        },
      });
    } catch { /* suppress */ }
    return apiErrorForRoute(error, 'workday-presence seed-from-scorer POST');
  }
}
