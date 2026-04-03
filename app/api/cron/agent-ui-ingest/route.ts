/**
 * POST /api/cron/agent-ui-ingest
 * Body: { items: UiCriticItem[] } from GitHub Actions after Playwright + Sonnet.
 * Auth: CRON_SECRET Bearer.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { areAgentsEnabled } from '@/lib/agents/agents-enabled';
import { ingestUiCriticItems } from '@/lib/agents/ingest-ui-critic';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  if (process.env.UI_CRITIC_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'ui_critic_disabled' });
  }

  const supabase = createServerClient();
  const enabled = await areAgentsEnabled(supabase);
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'agents_disabled' });
  }

  const body = await request.json().catch(() => ({}));
  const out = await ingestUiCriticItems(supabase, body);
  const ok = out.errors.length === 0 || Boolean(out.skipped_reason);
  return NextResponse.json({ ok, ...out });
}
