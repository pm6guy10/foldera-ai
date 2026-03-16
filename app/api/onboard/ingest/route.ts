/**
 * POST /api/onboard/ingest
 *
 * Public route — no auth required. Accepts a Claude conversation export
 * and processes it into the TKG under a client-generated tempUserId.
 *
 * Body: { text: string; tempUserId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { apiError, validationError } from '@/lib/utils/api-error';
import { ingestBodySchema } from '@/lib/utils/api-schemas';
import { rateLimit } from '@/lib/utils/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';

export const dynamic = 'force-dynamic';

const ONBOARD_RATE_LIMIT = { limit: 10, window: 3600 } as const;

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rl = await rateLimit(`onboard:ingest:${ip}`, ONBOARD_RATE_LIMIT);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before trying again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000))),
          },
        },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return validationError('Invalid JSON');
    }

    const parsed = ingestBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
      return validationError(msg);
    }

    const { text, tempUserId } = parsed.data;
    try {
      const result = await extractFromConversation(text, tempUserId);
      return NextResponse.json({
        signalId: result.signalId,
        decisionsWritten: result.decisionsWritten,
        patternsUpdated: result.patternsUpdated,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('already ingested')) {
        return NextResponse.json({ signalId: null, decisionsWritten: 0, patternsUpdated: 0 });
      }
      return apiError(err, 'onboard/ingest');
    }
  } catch (err: unknown) {
    return apiError(err, 'onboard/ingest');
  }
}
