import { NextResponse } from 'next/server';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { resolveUser } from '@/lib/auth/resolve-user';
import { getCostEventSummaryReport } from '@/lib/utils/api-tracker';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { blockDevRouteDuringEgressEmergency } from '@/lib/utils/egress-emergency';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const emergencyBlock = blockDevRouteDuringEgressEmergency(request);
  if (emergencyBlock) return emergencyBlock;

  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const summary = await getCostEventSummaryReport();
    return NextResponse.json(summary);
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'dev/cost-summary GET');
  }
}
