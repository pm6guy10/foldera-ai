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

  // Handle email.opened — increment waitlist open tracking
  if (event.type === 'email.opened') {
    const toEmail = (event.data?.to as string[] | undefined)?.[0]
      ?? (event.data?.to as string | undefined)
      ?? '';

    if (toEmail) {
      const supabase = createServerClient();
      const { data: row } = await supabase
        .from('waitlist')
        .select('id, open_count')
        .ilike('email', toEmail)
        .maybeSingle();

      if (row) {
        await supabase
          .from('waitlist')
          .update({
            open_count:     (row.open_count ?? 0) + 1,
            last_opened_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        console.log('[resend/webhook] email.opened tracked for', toEmail);
      }
    }
  }

  return NextResponse.json({ received: true });
}
