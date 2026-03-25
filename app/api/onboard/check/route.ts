import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { hasCompletedOnboarding } from '@/lib/auth/onboarding-state';
import { apiError } from '@/lib/utils/api-error';

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ hasOnboarded: await hasCompletedOnboarding(session.user.id) });
  } catch (err) {
    return apiError(err, 'onboard/check');
  }
}
