import { createServerClient, type SupabaseClient } from '@/lib/db/client';

interface UserSubscriptionRow {
  user_id: string;
  plan: string | null;
  status: string | null;
}

function isActivePaidSubscription(subscription: UserSubscriptionRow): boolean {
  return subscription.status === 'active' && (subscription.plan === 'pro' || subscription.plan === 'trial');
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

  for (const subscription of (data ?? []) as UserSubscriptionRow[]) {
    if (isActivePaidSubscription(subscription)) {
      eligibleUserIds.add(subscription.user_id);
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
