import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';
import { renderWelcomeEmailHtml, sendResendEmail } from '@/lib/email/resend';
import { MS_90D } from '@/lib/config/constants';
import { syncGoogle } from '@/lib/sync/google-sync';
import { syncMicrosoft } from '@/lib/sync/microsoft-sync';

const GOAL_BUCKETS: Record<string, { goal_text: string; category: string }> = {
  'Job search': { goal_text: 'Active job search and career transition', category: 'career' },
  'Career growth': { goal_text: 'Professional development and advancement in current role', category: 'career' },
  'Side project': { goal_text: 'Building and shipping a side project', category: 'project' },
  'Business ops': { goal_text: 'Business operations and stakeholder management', category: 'other' },
  'Health & family': { goal_text: 'Health, wellness, and family priorities', category: 'health' },
  'Financial': { goal_text: 'Financial planning and obligations', category: 'financial' },
  'Relationships': { goal_text: 'Maintaining and building key relationships', category: 'relationship' },
  'Learning': { goal_text: 'Skill building and continuous learning', category: 'other' },
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

    const rows: Record<string, unknown>[] = [];

    // Map bucket labels to goals
    for (const label of buckets) {
      const bucket = GOAL_BUCKETS[label];
      if (!bucket) continue;
      rows.push({
        user_id: userId,
        goal_text: bucket.goal_text,
        goal_category: bucket.category,
        priority: 3,
        current_priority: true,
        source: 'onboarding_bucket',
      });
    }

    // Free text goal
    if (freeText && freeText.trim().length > 0) {
      rows.push({
        user_id: userId,
        goal_text: freeText.trim(),
        goal_category: 'other',
        priority: 4,
        current_priority: true,
        source: 'onboarding_stated',
      });
    }

    // Always insert the onboarding marker
    rows.push({
      user_id: userId,
      goal_text: '__ONBOARDING_COMPLETE__',
      goal_category: 'other',
      priority: 1,
      current_priority: false,
      source: 'onboarding_marker',
    });

    const { error: replaceError } = await supabase.rpc('replace_onboarding_goals', {
      p_user_id: userId,
      p_rows: rows,
    });
    if (replaceError) {
      return apiErrorForRoute(replaceError, 'onboard/set-goals');
    }

    // Fire-and-forget: start inbox sync immediately so the overnight cron has signals.
    void (async () => {
      try {
        const { data: tokRows, error: tokErr } = await supabase
          .from('user_tokens')
          .select('provider')
          .eq('user_id', userId)
          .is('disconnected_at', null);
        if (tokErr) return;
        for (const t of tokRows ?? []) {
          try {
            if (t.provider === 'google') await syncGoogle(userId, { maxLookbackMs: MS_90D });
            if (t.provider === 'microsoft') await syncMicrosoft(userId, { maxLookbackMs: MS_90D });
          } catch (syncErr) {
            console.error(
              '[onboard/set-goals] immediate sync failed:',
              t.provider,
              syncErr instanceof Error ? syncErr.message : String(syncErr),
            );
          }
        }
      } catch (e) {
        console.error('[onboard/set-goals] immediate sync bootstrap failed:', e);
      }
    })();

    try {
      const { count: connectedProviderCount, error: tokenError } = await supabase
        .from('user_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (tokenError) {
        throw tokenError;
      }

      if ((connectedProviderCount ?? 0) > 0) {
        const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(userId);
        if (authUserError) {
          throw authUserError;
        }

        const user = authUserData.user;
        const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
        const welcomeEmailSent = metadata.welcome_email_sent === true;
        const email = typeof user?.email === 'string' && user.email.trim().length > 0
          ? user.email
          : session.user.email ?? null;

        if (!welcomeEmailSent && email) {
          const baseUrl = (process.env.NEXTAUTH_URL ?? 'https://www.foldera.ai').replace(/\/$/, '');
          const bodyText = `Welcome to Foldera.

You're connected. Your first read arrives tomorrow morning.

Foldera will scan your last 90 days of email, find what's slipping, and deliver one directive with finished work attached.

No prompts. No setup. Just approve or skip.

View your dashboard: ${baseUrl}/dashboard`;
          const sendResult = await sendResendEmail({
            from: 'Foldera <brief@foldera.ai>',
            to: email,
            subject: 'Welcome to Foldera',
            text: bodyText,
            html: renderWelcomeEmailHtml(baseUrl),
            tags: [
              { name: 'email_type', value: 'welcome_connected' },
              { name: 'user_id', value: userId },
            ],
          });

          const sendError =
            sendResult && typeof sendResult === 'object' && 'error' in sendResult
              ? (sendResult as { error?: { message?: string } | null }).error
              : null;
          if (sendError) {
            throw new Error(sendError.message ?? 'Welcome email send failed');
          }

          await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
              ...metadata,
              welcome_email_sent: true,
              welcome_email_sent_at: now,
            },
          });
        }
      }
    } catch (welcomeError) {
      console.error(
        '[onboard/set-goals] welcome email failed:',
        welcomeError instanceof Error ? welcomeError.message : String(welcomeError),
      );
    }

    return NextResponse.json({ ok: true, count: rows.length - 1 }); // exclude marker from count
  } catch (err) {
    return apiErrorForRoute(err, 'onboard/set-goals');
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
    return apiErrorForRoute(err, 'onboard/set-goals GET');
  }
}
