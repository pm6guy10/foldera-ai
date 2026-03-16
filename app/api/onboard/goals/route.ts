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
import { createServerClient } from '@/lib/db/client';
import { apiError, validationError } from '@/lib/utils/api-error';
import { onboardGoalsBodySchema } from '@/lib/utils/api-schemas';
import { rateLimit } from '@/lib/utils/rate-limit';
import { getRequestIp } from '@/lib/utils/request-ip';

export const dynamic = 'force-dynamic';

// Maps each answer index to a goal prefix + category + priority
const QUESTION_META = [
  { prefix: "What's on my mind:", category: 'other', priority: 5 },
  { prefix: '90-day goal:', category: 'career', priority: 4 },
  { prefix: 'Recurring obstacle:', category: 'other', priority: 3 },
  { prefix: 'A win looks like:', category: 'other', priority: 2 },
  { prefix: 'Additional context:', category: 'other', priority: 1 },
] as const;
const ONBOARD_RATE_LIMIT = { limit: 10, window: 3600 } as const;


export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const rl = await rateLimit(`onboard:goals:${ip}`, ONBOARD_RATE_LIMIT);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before trying again.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000))),
          },
        },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return validationError('Invalid JSON');
    }

    const parsed = onboardGoalsBodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid request';
      return validationError(msg);
    }

    const { answers, tempUserId } = parsed.data;

    const rows = answers
      .map((ans, i) => {
        const meta = QUESTION_META[i];
        if (!meta) {
          return null;
        }

        return { ans, meta };
      })
      .filter((entry): entry is { ans: string; meta: (typeof QUESTION_META)[number] } => {
        return entry !== null && entry.ans.length > 0;
      })
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

    const supabase = createServerClient();
    const { error } = await supabase.from('tkg_goals').insert(rows);

    if (error) {
      return apiError(error, 'onboard/goals');
    }

    return NextResponse.json({ goalsWritten: rows.length });
  } catch (err: unknown) {
    return apiError(err, 'onboard/goals');
  }
}
