/**
 * meeting-prep/auth — compatibility shim for generate-draft and scan-inbox routes.
 *
 * This app is single-user. getMeetingPrepUser() returns the ingest user record
 * for any authenticated session. getGoogleAccessToken() delegates to token-store.
 */

import { createClient } from '@supabase/supabase-js';
import { authOptions as _authOptions } from '@/lib/auth/auth-options';
import { getGoogleTokens } from '@/lib/auth/token-store';

export { _authOptions as authOptions };

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Returns the ingest user record for a given email.
 * In this single-user app the ingest user is always INGEST_USER_ID.
 */
export async function getMeetingPrepUser(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const ingestUserId = process.env.INGEST_USER_ID;
  if (!ingestUserId) return null;

  // Verify the email matches the session user in the integrations table
  const supabase = getSupabase();
  const { data } = await supabase
    .from('integrations')
    .select('user_id')
    .eq('user_id', ingestUserId)
    .eq('provider', 'google')
    .maybeSingle();

  if (!data) return null;
  return { id: ingestUserId, email };
}

/**
 * Returns a fresh Google access token for the given user ID.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens?.access_token) {
    throw new Error('No Google access token found for user ' + userId);
  }
  return tokens.access_token;
}
