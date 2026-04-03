import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { hasCompletedOnboarding } from '@/lib/auth/onboarding-state';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { isValidUuid } from '@/lib/auth/resolve-user';

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id || !isValidUuid(session.user.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ hasOnboarded: await hasCompletedOnboarding(session.user.id) });
  } catch (err) {
    return apiErrorForRoute(err, 'onboard/check');
  }
}
