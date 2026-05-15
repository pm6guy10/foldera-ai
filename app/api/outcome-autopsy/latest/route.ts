import { NextResponse } from 'next/server';

import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { getOutcomeLearningForUser } from '@/lib/outcome-learning/outcome-learning-engine';
import { apiErrorForRoute } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'CWU Access Specialist';

  try {
    const result = await getOutcomeLearningForUser(createServerClient(), auth.userId, {
      query,
    });

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          state: 'no_completed_outcome',
          message: 'No completed outcome with enough stored timeline evidence was found.',
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, artifact: result.artifact, learning: result.learning });
  } catch (error) {
    return apiErrorForRoute(error, 'outcome-autopsy/latest');
  }
}
