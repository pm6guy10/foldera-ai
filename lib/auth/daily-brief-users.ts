import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { OWNER_USER_ID } from '@/lib/auth/constants';

interface UserSubscriptionRow {
  user_id: string;
  plan: string | null;
  status: string | null;
}

function isActivePaidSubscription(subscription: UserSubscriptionRow): boolean {
  return subscription.status === 'active' && subscription.plan === 'pro';
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
  const nonOwnerUserIds = uniqueUserIds.filter((userId) => userId !== OWNER_USER_ID);
  const eligibleUserIds = new Set<string>();

  if (nonOwnerUserIds.length > 0) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('user_id, plan, status')
      .in('user_id', nonOwnerUserIds);

    if (error) {
      throw error;
    }

    for (const subscription of (data ?? []) as UserSubscriptionRow[]) {
      if (isActivePaidSubscription(subscription)) {
        eligibleUserIds.add(subscription.user_id);
      }
    }
  }

  return uniqueUserIds.filter(
    (userId) => userId === OWNER_USER_ID || eligibleUserIds.has(userId),
  );
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
