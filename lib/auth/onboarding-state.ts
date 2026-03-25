import { createServerClient, type SupabaseClient } from '@/lib/db/client';

export const ONBOARDING_SOURCES = ['onboarding_bucket', 'onboarding_stated', 'onboarding_marker'] as const;

export async function hasCompletedOnboarding(
  userId: string,
  supabaseArg?: SupabaseClient,
): Promise<boolean> {
  const supabase = supabaseArg ?? createServerClient();
  const { count, error } = await supabase
    .from('tkg_goals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('source', [...ONBOARDING_SOURCES]);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

