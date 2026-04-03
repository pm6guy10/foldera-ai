/**
 * Owner-only: read/write autonomous agents kill switch (tkg_goals system_config).
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { areAgentsEnabled, setAgentsEnabled, AGENTS_ENABLED_GOAL_TEXT } from '@/lib/agents/agents-enabled';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await resolveUser(request);
  if (session instanceof NextResponse) return session;
  if (session.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const supabase = createServerClient();
    const enabled = await areAgentsEnabled(supabase);
    return NextResponse.json({ enabled, goal_text: AGENTS_ENABLED_GOAL_TEXT });
  } catch (e: unknown) {
    return apiErrorForRoute(e, 'settings/agents GET');
  }
}

export async function POST(request: Request) {
  const session = await resolveUser(request);
  if (session instanceof NextResponse) return session;
  if (session.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const enabled = typeof body.enabled === 'boolean' ? body.enabled : null;
  if (enabled === null) {
    return NextResponse.json({ error: 'Body must include enabled: boolean' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    await setAgentsEnabled(supabase, enabled);
    return NextResponse.json({ ok: true, enabled });
  } catch (e: unknown) {
    return apiErrorForRoute(e, 'settings/agents POST');
  }
}
