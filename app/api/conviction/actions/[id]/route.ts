import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import {
  ACTION_DETAIL_SELECT,
  buildDashboardActionPayload,
} from '@/lib/conviction/action-read-shapes';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveParams(context: RouteContext): Promise<{ id: string }> {
  return context.params instanceof Promise ? await context.params : context.params;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await resolveParams(context);
  if (!id) {
    return NextResponse.json({ error: 'Action id required' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .select(ACTION_DETAIL_SELECT)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }
    if (!action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    return NextResponse.json(buildDashboardActionPayload(action as Record<string, unknown>, userId));
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/actions/[id]');
  }
}
