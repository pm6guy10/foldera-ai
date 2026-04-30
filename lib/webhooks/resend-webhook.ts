/**
 * Shared Resend (Svix) webhook handler for /api/resend/webhook and /api/webhooks/resend.
 */

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';
import { truncateSignalContent } from '@/lib/utils/signal-egress';
import { markMlSnapshotEmailEngagement } from '@/lib/ml/directive-ml-snapshot';
import {
  bumpAttentionSalienceForEntityIds,
  resolveEntityIdsForAttention,
} from '@/lib/signals/entity-attention-runtime';

const webhookRateMap = new Map<string, { count: number; resetAt: number }>();

function isWebhookRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const limit = 10;
  const entry = webhookRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    webhookRateMap.set(ip, { count: 1, resetAt: now + window });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

function classifyBriefLinkType(link: string): string {
  const u = link.toLowerCase();
  if (u.includes('/approve')) return 'approve';
  if (u.includes('/skip')) return 'skip';
  if (u.includes('/reject')) return 'reject';
  if (u.includes('/dashboard')) return 'dashboard';
  if (u.includes('/settings')) return 'settings';
  return 'other';
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export async function handleResendWebhookPost(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  if (isWebhookRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend/webhook] RESEND_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const body = await request.text();

  if (!body.trim()) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  const wh = new Webhook(secret);
  let event: { type: string; data: Record<string, unknown> };

  try {
    event = wh.verify(body, {
      'webhook-id': request.headers.get('webhook-id') ?? '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
      'webhook-signature': request.headers.get('webhook-signature') ?? '',
    }) as typeof event;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[resend/webhook] signature verification failed:', msg);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (event.type === 'email.opened') {
    const toEmail =
      (event.data?.to as string[] | undefined)?.[0] ??
      (event.data?.to as string | undefined) ??
      '';

    if (toEmail) {
      const supabase = createServerClient();
      const tags = event.data?.tags as Array<{ name: string; value: string }> | undefined;
      const isInviteOpen =
        tags?.some((t) => t.name === 'email_type' && t.value === 'waitlist_invite') ?? false;

      const { data: row } = await supabase
        .from('waitlist')
        .select('id, open_count')
        .ilike('email', toEmail)
        .maybeSingle();

      if (row) {
        const update: Record<string, unknown> = {
          open_count: (row.open_count ?? 0) + 1,
          last_opened_at: new Date().toISOString(),
        };
        if (isInviteOpen) {
          update.invite_opened_at = new Date().toISOString();
        }
        await supabase.from('waitlist').update(update).eq('id', row.id);
        console.log('[resend/webhook] email.opened tracked for', toEmail, isInviteOpen ? '(invite)' : '');
      }

      const dailyBriefUserId = tags?.find((tag) => tag.name === 'user_id')?.value ?? '';
      const emailType = tags?.find((tag) => tag.name === 'email_type')?.value ?? '';
      const briefActionId = tags?.find((tag) => tag.name === 'action_id')?.value ?? '';

      if (emailType === 'daily_brief' && dailyBriefUserId) {
        const openedAt = new Date().toISOString();
        const todayStr = openedAt.slice(0, 10);
        const contentHash = `daily_brief_opened:${dailyBriefUserId}:${todayStr}`;
        const content = `User opened daily brief email at ${openedAt}`;

        const { error: sigErr } = await supabase.from('tkg_signals').insert({
          user_id: dailyBriefUserId,
          source: 'resend_webhook',
          source_id: contentHash,
          type: 'daily_brief_opened',
      content: encrypt(truncateSignalContent(content)),
          content_hash: contentHash,
          author: 'foldera-system',
          occurred_at: openedAt,
          processed: true,
        });

        if (!sigErr) {
          console.log('[resend/webhook] daily_brief_opened signal recorded for', todayStr);
        }
        if (briefActionId) {
          void markMlSnapshotEmailEngagement(supabase, { actionId: briefActionId, opened: true });
          void (async () => {
            const { data: actionRow } = await supabase
              .from('tkg_actions')
              .select('*')
              .eq('id', briefActionId)
              .maybeSingle();
            if (!actionRow) return;
            const uid = (actionRow.user_id as string) || dailyBriefUserId;
            const ids = await resolveEntityIdsForAttention(
              supabase,
              uid,
              actionRow as Record<string, unknown>,
            );
            await bumpAttentionSalienceForEntityIds(supabase, uid, ids, 0.018, 0.72);
          })().catch((err) =>
            console.warn('[resend/webhook] attention bump failed:', err instanceof Error ? err.message : err),
          );
        }
      }
    }
  }

  if (event.type === 'email.clicked') {
    const tags = event.data?.tags as Array<{ name: string; value: string }> | undefined;
    const dailyBriefUserId = tags?.find((tag) => tag.name === 'user_id')?.value ?? '';
    const emailType = tags?.find((tag) => tag.name === 'email_type')?.value ?? '';
    const briefActionIdClick = tags?.find((tag) => tag.name === 'action_id')?.value ?? '';
    const click = event.data?.click as { link?: string } | undefined;
    const link = typeof click?.link === 'string' ? click.link : '';

    if (emailType === 'daily_brief' && dailyBriefUserId && link) {
      const supabase = createServerClient();
      const at = new Date().toISOString();
      const linkType = classifyBriefLinkType(link);
      const content = `User clicked ${linkType} in daily brief at ${at}`;
      const contentHash = sha256(`daily_brief_clicked|${dailyBriefUserId}|${at}|${link}`);

      const { error: sigErr } = await supabase.from('tkg_signals').insert({
        user_id: dailyBriefUserId,
        source: 'resend_webhook',
        source_id: contentHash,
        type: 'daily_brief_clicked',
      content: encrypt(truncateSignalContent(content)),
        content_hash: contentHash,
        author: 'foldera-system',
        occurred_at: at,
        processed: true,
      });

      if (!sigErr) {
        console.log('[resend/webhook] daily_brief_clicked recorded');
      }
      if (briefActionIdClick) {
        void markMlSnapshotEmailEngagement(supabase, { actionId: briefActionIdClick, clicked: true });
      }
    }
  }

  return NextResponse.json({ received: true });
}
