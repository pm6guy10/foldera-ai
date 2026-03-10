/**
 * POST /api/onboard/goals
 *
 * Public route — no auth required. Writes onboarding answers as tkg_goals
 * for a client-generated tempUserId so the conviction engine has data to
 * produce a first directive.
 *
 * Body: { answers: string[5]; tempUserId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Maps each question index to a goal prefix + category + priority
const QUESTION_META = [
  { prefix: 'Current decision:', category: 'career', priority: 5 },
  { prefix: '3–6 month goal:', category: 'other', priority: 4 },
  { prefix: 'Recurring obstacle:', category: 'other', priority: 3 },
  { prefix: "This week's success:", category: 'other', priority: 2 },
  { prefix: 'Deferred task:', category: 'other', priority: 1 },
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

  if (!Array.isArray(answers) || answers.length !== 5) {
    return NextResponse.json({ error: 'answers must be an array of exactly 5 strings' }, { status: 400 });
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
    console.error('[/api/onboard/goals]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goalsWritten: rows.length });
}
