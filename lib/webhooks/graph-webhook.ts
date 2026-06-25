// Microsoft Graph change-notification webhook handler.
//
// This is the heart of event-driven delivery: Graph POSTs here the instant Outlook inbox
// mail changes, and we run sync -> materiality gate -> deliver within seconds. No cron, no
// schedule, no user action.
//
// Trust model: the userId is recovered AND authenticated from the echoed clientState
// (`${userId}.${HMAC(GRAPH_WEBHOOK_SECRET, userId)}`) via authenticateClientState —
// constant-time, no DB lookup, and a forged body cannot mint a valid userId without the
// secret. A best-effort debounce (claimGraphPush) trims redundant brain runs on bursts;
// the trigger-runner's dedup cursor is the hard guarantee against a duplicate card.
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateClientState,
  ensureGraphSubscription,
  claimGraphPush,
} from '@/lib/sync/graph-subscription';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';
import { deliverWorkdayPresence } from '@/lib/workday-presence/deliver-now';

// Collapse a burst of notifications (one per new mail) into a single brain run.
const PUSH_DEBOUNCE_MS = 60 * 1000;

interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  lifecycleEvent?: string;
  resource?: string;
  resourceData?: { id?: string } | null;
}

/** Recover + authenticate a notification to a userId, or null if the clientState is bad. */
function authenticateNotification(n: GraphNotification): string | null {
  const userId = authenticateClientState(n.clientState);
  if (!userId) {
    console.warn('[graph-webhook] clientState failed auth for subscription', n.subscriptionId);
    return null;
  }
  return userId;
}

/** Sync the Outlook delta and, if material, fire the brain → card. */
async function processUser(userId: string): Promise<void> {
  const claimed = await claimGraphPush(userId, PUSH_DEBOUNCE_MS);
  if (!claimed) {
    console.log('[graph-webhook] debounced (recent push) for', userId);
    return;
  }
  try {
    const sync = await syncMicrosoft(userId);
    // Materiality gate lanes: Outlook mail is actionable inbound (mail lane); OneDrive file
    // touches are the non-actionable "drive" lane (the trigger path ignores file sources).
    const result = await deliverWorkdayPresence(userId, {
      trigger: 'push',
      syncDelta: {
        gmail: sync.mail_signals,
        calendar: sync.calendar_signals,
        drive: sync.file_signals,
      },
    });
    console.log('[graph-webhook] delivered for', userId, {
      seeded: result.seeded,
      skipped: result.skipped_reason,
    });
  } catch (err: unknown) {
    console.error('[graph-webhook] processUser failed for', userId, err instanceof Error ? err.message : err);
  }
}

export async function handleGraphWebhookPost(request: NextRequest): Promise<NextResponse> {
  // Validation handshake: Graph POSTs ?validationToken=... on subscription creation and
  // expects it echoed back as text/plain within 10s.
  const validationToken = request.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let body: { value?: GraphNotification[] } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const notifications = Array.isArray(body?.value) ? body!.value! : [];
  if (notifications.length === 0) {
    return NextResponse.json({ received: true, processed: 0 });
  }

  // Authenticate every notification; split lifecycle events from change events.
  const changeUserIds = new Set<string>();
  const lifecycleUserIds = new Set<string>();
  for (const n of notifications) {
    const userId = authenticateNotification(n);
    if (!userId) continue;
    if (n.lifecycleEvent) {
      lifecycleUserIds.add(userId);
    } else {
      changeUserIds.add(userId);
    }
  }

  // Lifecycle events (reauthorizationRequired / subscriptionRemoved / missed) → re-arm.
  for (const userId of lifecycleUserIds) {
    await ensureGraphSubscription(userId, { force: true }).catch((err) =>
      console.error('[graph-webhook] lifecycle re-arm failed for', userId, err),
    );
  }

  // Change events → sync + deliver (debounced per user).
  for (const userId of changeUserIds) {
    await processUser(userId);
  }

  return NextResponse.json({
    received: true,
    processed: changeUserIds.size,
    lifecycle: lifecycleUserIds.size,
  });
}
