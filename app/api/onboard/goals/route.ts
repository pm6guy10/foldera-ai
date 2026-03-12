/**
 * POST /api/onboard/goals
 *
 * Public route — no auth required. Writes onboarding answers as tkg_goals
 * for a client-generated tempUserId so the conviction engine has data to
 * produce a first directive.
 *
 * Body: { answers: string[]; tempUserId: string }
 * answers[0] = intro text ("what's on your mind")
 * answers[1] = 90-day goal
 * answers[2] = obstacles
 * answers[3] = what a win looks like
 * answers[4] = optional (unused in current flow, kept for compat)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maps each answer index to a goal prefix + category + priority
const QUESTION_META = [
  { prefix: "What's on my mind:", category: 'other', priority: 5 },
  { prefix: '90-day goal:', category: 'career', priority: 4 },
  { prefix: 'Recurring obstacle:', category: 'other', priority: 3 },
  { prefix: 'A win looks like:', category: 'other', priority: 2 },
  { prefix: 'Additional context:', category: 'other', priority: 1 },
] as const;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  let body: { answers?: unknown; tempUserId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { answers, tempUserId } = body;

  if (typeof tempUserId !== 'string' || !UUID_RE.test(tempUserId)) {
    return NextResponse.json({ error: 'Invalid tempUserId' }, { status: 400 });
  }

  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 5) {
    return NextResponse.json({ error: 'answers must be an array of 1–5 strings' }, { status: 400 });
  }

  const rows = (answers as string[])
    .map((ans, i) => ({ ans: String(ans).trim(), meta: QUESTION_META[i] }))
    .filter(({ ans }) => ans.length > 0)
    .map(({ ans, meta }) => ({
      user_id: tempUserId,
      goal_text: `${meta.prefix} ${ans}`,
      goal_category: meta.category,
      priority: meta.priority,
      source: 'onboard',
    }));

  if (rows.length === 0) {
    return NextResponse.json({ goalsWritten: 0 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('tkg_goals').insert(rows);

  if (error) {
    return apiError(error, 'onboard/goals');
  }

  return NextResponse.json({ goalsWritten: rows.length });
}
