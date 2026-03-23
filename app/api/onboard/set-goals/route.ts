import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiError, badRequest } from '@/lib/utils/api-error';

const GOAL_BUCKETS: Record<string, { goal_text: string; category: string }> = {
  'Job search': { goal_text: 'Active job search and career transition', category: 'career' },
  'Career growth': { goal_text: 'Professional development and advancement in current role', category: 'career' },
  'Side project': { goal_text: 'Building and shipping a side project', category: 'project' },
  'Business ops': { goal_text: 'Business operations and stakeholder management', category: 'work' },
  'Health & family': { goal_text: 'Health, wellness, and family priorities', category: 'personal' },
  'Financial': { goal_text: 'Financial planning and obligations', category: 'financial' },
  'Relationships': { goal_text: 'Maintaining and building key relationships', category: 'relationship' },
  'Learning': { goal_text: 'Skill building and continuous learning', category: 'learning' },
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { buckets, freeText, skipped } = body as {
      buckets: string[];
      freeText: string | null;
      skipped: boolean;
    };

    if (!Array.isArray(buckets)) {
      return badRequest('buckets must be an array');
    }

    const supabase = createServerClient();
    const userId = session.user.id;
    const now = new Date().toISOString();

    // Delete existing onboarding goals (full replace on edit)
    await supabase
      .from('tkg_goals')
      .delete()
      .eq('user_id', userId)
      .in('source', ['onboarding_bucket', 'onboarding_stated', 'onboarding_marker']);

    const rows: Record<string, unknown>[] = [];

    // Map bucket labels to goals
    for (const label of buckets) {
      const bucket = GOAL_BUCKETS[label];
      if (!bucket) continue;
      rows.push({
        user_id: userId,
        goal_text: bucket.goal_text,
        goal_category: bucket.category,
        goal_type: 'recurring',
        status: 'active',
        confidence: 60,
        priority: 3,
        current_priority: true,
        source: 'onboarding_bucket',
        updated_at: now,
      });
    }

    // Free text goal
    if (freeText && freeText.trim().length > 0) {
      rows.push({
        user_id: userId,
        goal_text: freeText.trim(),
        goal_category: 'other',
        goal_type: 'recurring',
        status: 'active',
        confidence: 70,
        priority: 4,
        current_priority: true,
        source: 'onboarding_stated',
        updated_at: now,
      });
    }

    // Always insert the onboarding marker
    rows.push({
      user_id: userId,
      goal_text: '__ONBOARDING_COMPLETE__',
      goal_category: 'system',
      goal_type: 'milestone',
      status: 'active',
      confidence: 100,
      priority: 0,
      current_priority: false,
      source: 'onboarding_marker',
      updated_at: now,
    });

    if (rows.length > 0) {
      const { error } = await supabase.from('tkg_goals').insert(rows);
      if (error) {
        return apiError(error, 'onboard/set-goals');
      }
    }

    return NextResponse.json({ ok: true, count: rows.length - 1 }); // exclude marker from count
  } catch (err) {
    return apiError(err, 'onboard/set-goals');
  }
}

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();
    const userId = session.user.id;

    const { data: goals } = await supabase
      .from('tkg_goals')
      .select('goal_text, source')
      .eq('user_id', userId)
      .in('source', ['onboarding_bucket', 'onboarding_stated']);

    const buckets: string[] = [];
    let freeText: string | null = null;

    for (const g of goals ?? []) {
      if (g.source === 'onboarding_stated') {
        freeText = g.goal_text;
      } else if (g.source === 'onboarding_bucket') {
        // Reverse map goal_text to label
        for (const [label, def] of Object.entries(GOAL_BUCKETS)) {
          if (def.goal_text === g.goal_text) {
            buckets.push(label);
            break;
          }
        }
      }
    }

    return NextResponse.json({ buckets, freeText });
  } catch (err) {
    return apiError(err, 'onboard/set-goals GET');
  }
}
