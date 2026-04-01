/**
 * POST /api/webhooks/resend — alias of /api/resend/webhook for Resend dashboard URL flexibility.
 */

import { NextRequest } from 'next/server';
import { handleResendWebhookPost } from '@/lib/webhooks/resend-webhook';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleResendWebhookPost(request);
}
