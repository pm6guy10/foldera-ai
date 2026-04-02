/**
 * GET /api/dev/email-preview
 * GET /api/dev/email-preview?variant=nothing
 *
 * Renders the daily-brief Resend HTML in the browser (no send).
 * Requires ALLOW_DEV_ROUTES=true (local / dev). Returns 404 when unset.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildDailyDirectiveEmailHtml,
  DEV_EMAIL_PREVIEW_SAMPLE_DIRECTIVE,
} from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.ALLOW_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const variant = request.nextUrl.searchParams.get('variant');
  const directive = variant === 'nothing' ? null : DEV_EMAIL_PREVIEW_SAMPLE_DIRECTIVE;
  const date = new Date().toISOString().slice(0, 10);
  const html = buildDailyDirectiveEmailHtml({
    baseUrl: origin,
    date,
    directive,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
