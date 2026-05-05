import { NextResponse } from 'next/server';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { resolveUser } from '@/lib/auth/resolve-user';
import { getWinnerTruthReport } from '@/lib/system/winner-truth';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await resolveUser(request);
  if (session instanceof NextResponse) return session;
  if (session.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const report = await getWinnerTruthReport(session.userId);
    return NextResponse.json(report);
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'system/winner-truth GET');
  }
}
