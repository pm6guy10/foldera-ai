/**
 * POST /api/webhooks/graph — Microsoft Graph change-notification webhook.
 *
 * Event-driven delivery for Outlook: Graph POSTs here the instant inbox mail changes, and
 * we run sync -> materiality gate -> deliver within seconds. This replaces cron polling.
 * Handles both the subscription-creation validation handshake (?validationToken=) and
 * change/lifecycle notifications. Auth + logic live in lib/webhooks/graph-webhook.ts.
 */
import { NextRequest } from 'next/server';
import { handleGraphWebhookPost } from '@/lib/webhooks/graph-webhook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleGraphWebhookPost(request);
}
