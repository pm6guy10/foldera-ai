/**
 * user-tokens.ts
 *
 * Manages the user_tokens table — stores OAuth refresh tokens
 * for background sync jobs (Gmail + Calendar sync).
 */

import { createServerClient } from '@/lib/db/client';
import { encryptToken, decryptToken, isEncrypted } from '@/lib/crypto/token-encryption';

interface SaveUserTokenParams {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  email?: string;
  scopes?: string;
}

/**
 * Save or update a user's OAuth token in user_tokens.
 */
export async function saveUserToken(
  userId: string,
  provider: 'google' | 'microsoft',
  params: SaveUserTokenParams,
): Promise<void> {
  const supabase = createServerClient();
  const now = new Date().toISOString();

  const row = {
    user_id: userId,
    provider,
    refresh_token: encryptToken(params.refresh_token),
    access_token: encryptToken(params.access_token),
    expires_at: params.expires_at,
    email: params.email ?? null,
    scopes: params.scopes ?? null,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from('user_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('user_tokens')
      .update(row)
      .eq('user_id', userId)
      .eq('provider', provider);
    if (error) {
      console.error(`[user-tokens] update failed:`, error.message);
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('user_tokens')
      .insert({ ...row, created_at: now });
    if (error) {
      console.error(`[user-tokens] insert failed:`, error.message);
      throw error;
    }
  }

  console.log(`[user-tokens] saved ${provider} token for user ${userId}`);
}

/**
 * Get a user's token from user_tokens, decrypting the stored values.
 */
export async function getUserToken(
  userId: string,
  provider: 'google' | 'microsoft',
): Promise<{
  refresh_token: string;
  access_token: string;
  expires_at: number;
  email: string | null;
  last_synced_at: string | null;
} | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('user_tokens')
    .select('refresh_token, access_token, expires_at, email, last_synced_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error || !data) return null;

  return {
    refresh_token: data.refresh_token && isEncrypted(data.refresh_token)
      ? decryptToken(data.refresh_token)
      : data.refresh_token,
    access_token: data.access_token && isEncrypted(data.access_token)
      ? decryptToken(data.access_token)
      : data.access_token,
    expires_at: data.expires_at,
    email: data.email,
    last_synced_at: data.last_synced_at,
  };
}

/**
 * Update last_synced_at timestamp after a sync completes.
 */
export async function updateSyncTimestamp(
  userId: string,
  provider: 'google' | 'microsoft',
): Promise<void> {
  const supabase = createServerClient();
  await supabase
    .from('user_tokens')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', provider);
}

/**
 * Delete a user's token (disconnect).
 */
export async function deleteUserToken(
  userId: string,
  provider: 'google' | 'microsoft',
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('user_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) {
    console.error(`[user-tokens] delete failed:`, error.message);
    throw error;
  }
  console.log(`[user-tokens] deleted ${provider} token for user ${userId}`);
}
