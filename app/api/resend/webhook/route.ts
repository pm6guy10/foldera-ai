/**
 * POST /api/resend/webhook
 *
 * Receives Resend webhook events and verifies the signature using svix.
 * Handles email.opened events to increment waitlist open tracking.
 *
 * Env vars:
 *   RESEND_WEBHOOK_SECRET — Webhook signing secret from Resend dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createServerClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';


export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend/webhook] RESEND_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const body = await request.text();

  // Svix signature verification
  const wh = new Webhook(secret);
  let event: { type: string; data: Record<string, unknown> };

  try {
    event = wh.verify(body, {
      'webhook-id':        request.headers.get('webhook-id') ?? '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': request.headers.get('webhook-signature') ?? '',
    }) as typeof event;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[resend/webhook] signature verification failed:', msg);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Handle email.opened
  if (event.type === 'email.opened') {
    const toEmail = (event.data?.to as string[] | undefined)?.[0]
      ?? (event.data?.to as string | undefined)
      ?? '';

    if (toEmail) {
      const supabase = createServerClient();

      // Detect invite emails by the tag set during send
      const tags = event.data?.tags as Array<{ name: string; value: string }> | undefined;
      const isInviteOpen = tags?.some(
        t => t.name === 'email_type' && t.value === 'waitlist_invite'
      ) ?? false;

      // ── 1. Waitlist open tracking ───────────────────────────────────────────
      const { data: row } = await supabase
        .from('waitlist')
        .select('id, open_count')
        .ilike('email', toEmail)
        .maybeSingle();

      if (row) {
        const update: Record<string, unknown> = {
          open_count:     (row.open_count ?? 0) + 1,
          last_opened_at: new Date().toISOString(),
        };

        // First open of the invite email — capture the timestamp
        if (isInviteOpen) {
          update.invite_opened_at = new Date().toISOString();
        }

        await supabase
          .from('waitlist')
          .update(update)
          .eq('id', row.id);

        console.log(
          '[resend/webhook] email.opened tracked for', toEmail,
          isInviteOpen ? '(invite)' : ''
        );
      }

      // ── 2. Daily brief open tracking ────────────────────────────────────────
      // If the recipient is the primary user (DAILY_BRIEF_TO_EMAIL), record a
      // daily_brief_opened signal so the engagement-drop check stays current.
      const briefEmail = process.env.DAILY_BRIEF_TO_EMAIL ?? '';
      const userId     = process.env.INGEST_USER_ID ?? '';

      if (briefEmail && userId && toEmail.toLowerCase() === briefEmail.toLowerCase()) {
        const todayStr   = new Date().toISOString().slice(0, 10);
        const contentHash = `daily_brief_opened:${todayStr}`;

        // Deduplicated by content_hash (one signal per calendar day)
        const { error: sigErr } = await supabase.from('tkg_signals').insert({
          user_id:      userId,
          source:       'resend_webhook',
          source_id:    contentHash,
          type:         'daily_brief_opened',
          content:      `Daily brief opened on ${todayStr}`,
          content_hash: contentHash,
          author:       'foldera-system',
          occurred_at:  new Date().toISOString(),
          processed:    true,
        });

        if (!sigErr) {
          console.log('[resend/webhook] daily_brief_opened signal recorded for', todayStr);
        }
        // Silently ignore duplicate-hash conflicts — that's expected on multiple opens
      }
    }
  }

  return NextResponse.json({ received: true });
}
