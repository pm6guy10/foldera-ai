/**
 * POST /api/resend/webhook
 *
 * Receives Resend webhook events and verifies the signature using svix.
 * Handles email.opened, email.clicked, and (via nightly job) complements not-opened tracking.
 *
 * Env vars:
 *   RESEND_WEBHOOK_SECRET — Webhook signing secret from Resend dashboard
 */

import { NextRequest } from 'next/server';
import { handleResendWebhookPost } from '@/lib/webhooks/resend-webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleResendWebhookPost(request);
}
