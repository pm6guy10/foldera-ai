/**
 * POST /api/priorities/update
 * Body: { priorities: [{ text: string, category?: string }] }
 *
 * Replaces all current_priority goals for the user.
 * Max 3 priorities. Each stored in tkg_goals with current_priority=true.
 */

import { createServerClient } from '@/lib/db/client';
import { NextResponse }     from 'next/server';
import { getServerSession }  from 'next-auth';
import { getAuthOptions }    from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';


interface PriorityInput {
  text: string;
  category?: string;
}

const VALID_CATEGORIES = ['career', 'financial', 'relationship', 'health', 'project', 'other'];

export async function POST(request: Request) {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => ({}));
  const { priorities } = body as { priorities?: PriorityInput[] };

  if (!Array.isArray(priorities)) {
    return NextResponse.json({ error: 'priorities must be an array' }, { status: 400 });
  }

  // Filter out empty strings, cap at 3
  const cleaned = priorities
    .filter(p => p.text && p.text.trim().length > 0)
    .slice(0, 3)
    .map(p => ({
      text: p.text.trim(),
      category: VALID_CATEGORIES.includes(p.category ?? '') ? p.category! : 'other',
    }));

  const supabase = createServerClient();
  const rows = cleaned.map((p) => ({
    goal_text: p.text,
    goal_category: p.category,
    priority: 5,
  }));

  const { error: rpcError } = await supabase.rpc('replace_current_priorities', {
    p_user_id: userId,
    p_rows: rows,
  });

  if (rpcError) {
    console.error('[priorities/update] atomic replace failed:', rpcError.message);
    return NextResponse.json({ error: 'Failed to save priorities' }, { status: 500 });
  }

  return NextResponse.json({ updated: cleaned.length });
}

// GET: fetch current priorities
export async function GET() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_goals')
    .select('id, goal_text, goal_category')
    .eq('user_id', userId)
    .eq('current_priority', true)
    .order('created_at', { ascending: true })
    .limit(3);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }

  return NextResponse.json({
    priorities: (data ?? []).map(g => ({
      text: g.goal_text,
      category: g.goal_category,
    })),
  });
}
