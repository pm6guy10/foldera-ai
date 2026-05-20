import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState } from '@/lib/workday-presence/model';
import { buildRightNowMessagePayload } from '@/lib/workday-presence/message';
import { buildSlackTestModeRightNowMessage } from '@/lib/slack-test-mode/right-now';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const state = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    const payload = buildRightNowMessagePayload(state);

    return NextResponse.json({
      payload,
      slack_test_mode: buildSlackTestModeRightNowMessage(payload),
    });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'slack test-mode right-now GET');
  }
}

