import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { listConnectedUserIds } from '@/lib/auth/user-tokens';

interface UserSubscriptionRow {
  user_id: string;
  plan: string | null;
  status: string | null;
}

/** Active paid/trial/free — all plans that should receive the daily brief when connected. */
function isActiveEligiblePlan(plan: string | null): boolean {
  if (!plan) return false;
  return plan === 'pro' || plan === 'trial' || plan === 'free';
}

export async function filterDailyBriefEligibleUserIds(
  userIds: string[],
  supabaseArg?: SupabaseClient,
): Promise<string[]> {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return [];
  }

  const supabase = supabaseArg ?? createServerClient();
  const eligibleUserIds = new Set<string>();

  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan, status')
    .in('user_id', uniqueUserIds);

  if (error) {
    throw error;
  }

  const subByUser = new Map<string, UserSubscriptionRow>();
  for (const row of (data ?? []) as UserSubscriptionRow[]) {
    subByUser.set(row.user_id, row);
  }

  const connected = new Set(await listConnectedUserIds(supabase));

  for (const userId of uniqueUserIds) {
    const sub = subByUser.get(userId);

    // Free-forever semantics (locked pricing decision in .cursorrules):
    // Any user with live OAuth tokens is cron-eligible regardless of
    // subscription status. This mathematically guarantees:
    //   - fresh strangers (connected, no user_subscriptions row)
    //   - past_due users (still in Stripe grace period)
    //   - expired-trial users (fall through to free tier)
    //   - downgraded/cancelled users who still have connected tokens
    // Hard opt-out cost control happens upstream: the cleanup-cancelled
    // cron revokes tokens, which naturally drops the user from `connected`.
    if (connected.has(userId)) {
      eligibleUserIds.add(userId);
      continue;
    }

    // Not OAuth-connected: only include if a paid/trial/free row explicitly
    // marks them active. Cron has no signals to process without tokens, but
    // we keep this branch so readiness failure is surfaced per user rather
    // than silently dropping a paying customer.
    if (sub && sub.status === 'active' && isActiveEligiblePlan(sub.plan)) {
      eligibleUserIds.add(userId);
    }
  }

  return uniqueUserIds.filter((userId) => eligibleUserIds.has(userId));
}

export async function getVerifiedDailyBriefRecipientEmail(
  userId: string,
  supabaseArg?: SupabaseClient,
): Promise<string | null> {
  const supabase = supabaseArg ?? createServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    console.error('[daily-brief-users] auth lookup failed:', error.message);
    return null;
  }

  const email = data.user?.email?.trim().toLowerCase() ?? '';
  const emailVerified = Boolean(data.user?.email_confirmed_at ?? data.user?.confirmed_at);

  if (!email || !emailVerified) {
    return null;
  }

  return email;
}
