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

function hasTestTokenPrefix(value: string): boolean {
  return value.startsWith('test_');
}

/**
 * Save or update a user's OAuth token in user_tokens.
 */
export async function saveUserToken(
  userId: string,
  provider: 'google' | 'microsoft',
  params: SaveUserTokenParams,
): Promise<void> {
  if (hasTestTokenPrefix(params.refresh_token) || hasTestTokenPrefix(params.access_token)) {
    console.warn(`[user-tokens] rejected test token write for ${provider} user ${userId}`);
    throw new Error('Refusing to persist test token value');
  }

  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Normalize expires_at to epoch SECONDS. This is the single enforcement point
  // that prevents the Class D token expiry unit mismatch. Google callbacks store
  // milliseconds, Microsoft stores seconds, NextAuth stores seconds. We normalize
  // here so all downstream consumers can assume seconds.
  let expiresAtSec = params.expires_at;
  // If the value is clearly in milliseconds (> year 2100 in seconds = 4102444800),
  // convert to seconds. This heuristic is safe because epoch seconds won't exceed
  // 4102444800 until the year 2100.
  if (expiresAtSec > 4_102_444_800) {
    expiresAtSec = Math.floor(expiresAtSec / 1000);
  }

  const row = {
    user_id: userId,
    provider,
    refresh_token: encryptToken(params.refresh_token),
    access_token: encryptToken(params.access_token),
    disconnected_at: null,
    expires_at: expiresAtSec,
    email: params.email ?? null,
    scopes: params.scopes ?? null,
    updated_at: now,
  };

  const { error } = await supabase
    .from('user_tokens')
    .upsert(
      { ...row, created_at: now },
      { onConflict: 'user_id,provider', ignoreDuplicates: false },
    );

  if (error) {
    console.error(`[user-tokens] upsert failed:`, error.message);
    throw error;
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

  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    return null;
  }

  if (typeof data.refresh_token !== 'string' || data.refresh_token.length === 0) {
    return null;
  }

  return {
    refresh_token: isEncrypted(data.refresh_token)
      ? decryptToken(data.refresh_token)
      : data.refresh_token,
    access_token: isEncrypted(data.access_token)
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
 * Return all distinct user IDs that have a token for the given provider.
 * Used by cron sync jobs to loop all connected users, not just INGEST_USER_ID.
 */
export async function getAllUsersWithProvider(
  provider: 'google' | 'microsoft',
): Promise<string[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('user_tokens')
    .select('user_id')
    .eq('provider', provider)
    .not('access_token', 'is', null)
    .is('disconnected_at', null);

  if (error) {
    console.error(`[user-tokens] getAllUsersWithProvider(${provider}) failed:`, error.message);
    return [];
  }

  return (data ?? []).map((row) => row.user_id);
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

/**
 * Soft-disconnect a user's token while preserving the row for reconnect flows.
 * This clears OAuth secrets and marks the row as disconnected.
 */
export async function softDisconnectUserToken(
  userId: string,
  provider: 'google' | 'microsoft',
): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('user_tokens')
    .update({
      access_token: null,
      refresh_token: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    console.error(`[user-tokens] soft disconnect failed:`, error.message);
    throw error;
  }

  console.log(`[user-tokens] soft-disconnected ${provider} token for user ${userId}`);
}
