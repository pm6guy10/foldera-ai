// DEV / OPS — owner-only. Read-only env + DB connectivity audit (no secret values returned).

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { blockDevRouteDuringEgressEmergency } from '@/lib/utils/egress-emergency';

export const dynamic = 'force-dynamic';

const EXPECTED_STRIPE_PRO_PRICE_ID = 'price_1TF00IRrgMYs6VrdugNcEC9z';

type CheckResult = { ok: boolean; detail: string };

function envPresent(name: string): CheckResult {
  const v = process.env[name];
  if (typeof v === 'string' && v.trim().length > 0) {
    return { ok: true, detail: 'set' };
  }
  return { ok: false, detail: 'missing_or_empty' };
}

function stripeProPriceCheck(): CheckResult {
  const v = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (!v) return { ok: false, detail: 'missing_or_empty' };
  if (v === EXPECTED_STRIPE_PRO_PRICE_ID) return { ok: true, detail: 'matches_expected' };
  return { ok: false, detail: 'mismatch' };
}

function sentryDsnCheck(): CheckResult {
  const v = process.env.SENTRY_DSN?.trim();
  if (!v) return { ok: false, detail: 'missing_or_empty' };
  if (!/^https:\/\//i.test(v)) {
    return { ok: false, detail: 'invalid_scheme' };
  }
  if (
    /placeholder|changeme|your[_-]?sentry|your[_-]?dsn|example\.com|localhost|127\.0\.0\.1|xxx\.ingest/i.test(
      v,
    )
  ) {
    return { ok: false, detail: 'looks_like_placeholder' };
  }
  return { ok: true, detail: 'set' };
}

async function databaseCheck(): Promise<CheckResult> {
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from('tkg_goals').select('id').limit(1);
    if (error) {
      return { ok: false, detail: 'query_failed' };
    }
    return { ok: true, detail: 'connected' };
  } catch {
    return { ok: false, detail: 'exception' };
  }
}

export async function GET(request: Request) {
  const emergencyBlock = blockDevRouteDuringEgressEmergency(request);
  if (emergencyBlock) return emergencyBlock;

  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const checks: Record<string, CheckResult> = {
    STRIPE_SECRET_KEY: envPresent('STRIPE_SECRET_KEY'),
    STRIPE_PRO_PRICE_ID: stripeProPriceCheck(),
    STRIPE_WEBHOOK_SECRET: envPresent('STRIPE_WEBHOOK_SECRET'),
    RESEND_API_KEY: envPresent('RESEND_API_KEY'),
    RESEND_WEBHOOK_SECRET: envPresent('RESEND_WEBHOOK_SECRET'),
    RESEND_FROM_EMAIL: envPresent('RESEND_FROM_EMAIL'),
    SENTRY_DSN: sentryDsnCheck(),
    NEXTAUTH_SECRET: envPresent('NEXTAUTH_SECRET'),
    ENCRYPTION_KEY: envPresent('ENCRYPTION_KEY'),
    database: await databaseCheck(),
  };

  const all_ok = Object.values(checks).every((c) => c.ok);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    all_ok,
    expected_stripe_pro_price_id: EXPECTED_STRIPE_PRO_PRICE_ID,
    checks,
  });
}
