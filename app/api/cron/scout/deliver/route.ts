/**
 * GET /api/cron/scout/deliver
 *
 * Scout lane (issue #486): run the proactive scout loop for the background user
 * and deliver any finished, review-gated proposals Slack-first (the full proposal
 * as a Slack card, with email as an opt-in fallback). Never auto-sends an artifact
 * to a third party — it only notifies the owner on their own rails.
 *
 * Inert unless SCOUT_DELIVERY_ENABLED (which requires the Scout master flag) —
 * returns a skipped response otherwise, so this route is safe to ship before the
 * lane is turned on. Owner-triggered (CRON_SECRET bearer), like index-drive; it is
 * intentionally not registered as a scheduled vercel.json cron so no paid loop
 * runs until the owner explicitly triggers it.
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { isScoutDeliveryEnabled } from '@/lib/config/prelaunch-spend';
import { runScoutLoop } from '@/lib/scout/scout-loop';
import { deliverScoutProposals } from '@/lib/scout/delivery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — one scout + deliver pass.

export async function GET(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  if (!isScoutDeliveryEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'SCOUT_DELIVERY_ENABLED (with the Scout master flag) is required',
    });
  }

  // Background/cron user only (AGENTS.md): the owner-first delivery targets are
  // single owner-gated envs, so this lane runs for the one configured user.
  const userId = process.env.INGEST_USER_ID?.trim();
  if (!userId) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'INGEST_USER_ID not configured' });
  }

  // runScoutLoop self-gates on the Scout master flag + paid-LLM allowance, and
  // returns [] (safe silence) when there is nothing worth surfacing — no paid call
  // is made on empty context.
  const proposals = await runScoutLoop(userId);
  if (proposals.length === 0) {
    return NextResponse.json({
      ok: true,
      delivered: false,
      proposals: 0,
      reason: 'safe silence — nothing worth surfacing',
    });
  }

  const result = await deliverScoutProposals(userId, proposals);
  return NextResponse.json({ ok: true, ...result });
}
