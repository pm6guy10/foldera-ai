/**
 * token-store.ts
 *
 * Unified token retrieval for Google and Microsoft OAuth.
 * All reads/writes go through the `user_tokens` table.
 * The `integrations` table is deprecated — do not read from it.
 */

import { google } from 'googleapis';
import { createServerClient } from '@/lib/db/client';
import { decryptToken, isEncrypted } from '@/lib/crypto/token-encryption';
import {
  getUserToken,
  saveUserToken,
  softDisconnectAfterFatalOAuthRefresh,
} from '@/lib/auth/user-tokens';
import {
  isGoogleRefreshFatalError,
  isMicrosoftRefreshFatalError,
} from '@/lib/auth/oauth-refresh-fatals';


interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

interface MicrosoftTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface StoredMicrosoftTokenRow {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  email: string | null;
  disconnected_at: string | null;
  oauth_reauth_required_at: string | null;
}

export type MicrosoftRefreshOutcome =
  | {
      status: 'ok';
      tokens: MicrosoftTokens;
      refreshed: boolean;
    }
  | {
      status: 'retryable_failure';
      error_code: string;
      error_description: string;
      http_status: number | null;
    }
  | {
      status: 'fatal_reauth_required';
      error_code: string;
      error_description: string;
      http_status: number | null;
      reauth_required_at: string | null;
    }
  | {
      status: 'missing_refresh_token';
      error_code: 'no_token_row' | 'missing_access_token' | 'no_refresh_token';
      error_description: string;
      reauth_required_at: string | null;
    };

function decryptStoredToken(value: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return isEncrypted(value) ? decryptToken(value) : value;
}

async function getStoredMicrosoftTokenRow(userId: string): Promise<StoredMicrosoftTokenRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_tokens')
    .select(
      'access_token, refresh_token, expires_at, email, disconnected_at, oauth_reauth_required_at',
    )
    .eq('user_id', userId)
    .eq('provider', 'microsoft')
    .maybeSingle();

  if (error || !data) return null;

  const row = data as StoredMicrosoftTokenRow;
  return {
    access_token: decryptStoredToken(row.access_token),
    refresh_token: decryptStoredToken(row.refresh_token),
    expires_at: typeof row.expires_at === 'number' ? row.expires_at : null,
    email: row.email ?? null,
    disconnected_at: row.disconnected_at ?? null,
    oauth_reauth_required_at: row.oauth_reauth_required_at ?? null,
  };
}

/**
 * Retrieves and refreshes Google tokens for a user.
 * Reads from user_tokens table.
 */
export async function getGoogleTokens(userId: string): Promise<GoogleTokens | null> {
  const row = await getUserToken(userId, 'google');
  if (!row) return null;

  const tokens: GoogleTokens = {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    // expires_at is normalized to seconds in user_tokens; expiry_date is ms for googleapis
    expiry_date: row.expires_at,
  };

  // Proactively refresh if token expires within 6 hours so background cron
  // runs never hit an expired token mid-execution (LESSONS_LEARNED rule #2).
  // expires_at is normalized to epoch SECONDS by saveUserToken.
  if (tokens.expiry_date && tokens.expiry_date < Date.now() / 1000 + 6 * 3600) {
    return await refreshGoogleTokens(userId, tokens, row.email ?? undefined);
  }

  return tokens;
}

/**
 * Refreshes Google tokens and persists to user_tokens.
 */
async function refreshGoogleTokens(userId: string, tokens: GoogleTokens, email?: string): Promise<GoogleTokens | null> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    const newTokens: GoogleTokens = {
      access_token: credentials.access_token!,
      refresh_token: credentials.refresh_token || tokens.refresh_token,
      // credentials.expiry_date is in ms; saveUserToken auto-normalizes to seconds
      expiry_date: credentials.expiry_date || Date.now() + 3600 * 1000,
    };

    // Persist refreshed tokens — saveUserToken normalizes ms to seconds
    // Pass email through to prevent it being wiped to null on each refresh
    await saveUserToken(userId, 'google', {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: newTokens.expiry_date,
      email,
    });

    return newTokens;
  } catch (error: any) {
    const errorCode = error?.response?.data?.error ?? error?.code ?? 'unknown';
    const errorDesc = error?.response?.data?.error_description ?? error?.message ?? '';
    console.error(JSON.stringify({
      event: 'token_refresh_failed',
      provider: 'google',
      userId,
      error_code: errorCode,
      error_description: errorDesc.slice(0, 200),
    }));
    if (isGoogleRefreshFatalError(String(errorCode), String(errorDesc))) {
      await softDisconnectAfterFatalOAuthRefresh(userId, 'google', {
        source: 'token-store.refreshGoogleTokens',
        error_code: String(errorCode),
        error_description: errorDesc,
      });
    }
    return null;
  }
}

/**
 * Retrieves and refreshes Microsoft tokens for a user.
 * Reads from user_tokens table.
 */
export async function getMicrosoftTokens(userId: string): Promise<MicrosoftTokens | null> {
  const outcome = await getMicrosoftTokensWithRefreshOutcome(userId);
  return outcome.status === 'ok' ? outcome.tokens : null;
}

/**
 * Refreshes Microsoft tokens and persists to user_tokens.
 */
async function refreshMicrosoftTokens(
  userId: string,
  tokens: MicrosoftTokens,
  email?: string,
): Promise<MicrosoftRefreshOutcome> {
  if (!tokens.refresh_token) {
    const error_code = 'no_refresh_token';
    const error_description = 'User must re-authenticate to obtain refresh token';
    console.error(JSON.stringify({
      event: 'token_refresh_failed',
      provider: 'microsoft',
      userId,
      error_code,
      error_description,
    }));
    return {
      status: 'missing_refresh_token',
      error_code,
      error_description,
      reauth_required_at: null,
    };
  }

  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
        scope: 'openid profile email offline_access User.Read Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Tasks.Read',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      let errorCode = 'unknown';
      let errorDesc = '';
      try {
        const parsed = JSON.parse(errorBody);
        errorCode = parsed.error ?? 'unknown';
        errorDesc = parsed.error_description ?? '';
      } catch { /* non-JSON body */ }
      console.error(JSON.stringify({
        event: 'token_refresh_failed',
        provider: 'microsoft',
        userId,
        http_status: response.status,
        error_code: errorCode,
        error_description: errorDesc.slice(0, 200),
      }));
      if (isMicrosoftRefreshFatalError(errorCode, errorDesc)) {
        await softDisconnectAfterFatalOAuthRefresh(userId, 'microsoft', {
          source: 'token-store.refreshMicrosoftTokens',
          error_code: errorCode,
          error_description: errorDesc,
        });
        return {
          status: 'fatal_reauth_required',
          error_code: String(errorCode),
          error_description: String(errorDesc),
          http_status: response.status,
          reauth_required_at: new Date().toISOString(),
        };
      }
      return {
        status: 'retryable_failure',
        error_code: String(errorCode),
        error_description: String(errorDesc),
        http_status: response.status,
      };
    }

    const data = await response.json();

    const newTokens: MicrosoftTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };

    // Persist refreshed tokens to user_tokens
    // Pass email through to prevent it being wiped to null on each refresh
    await saveUserToken(userId, 'microsoft', {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: newTokens.expires_at,
      email,
    });

    console.log(`[token-store] Microsoft tokens refreshed for user ${userId}`);
    return {
      status: 'ok',
      tokens: newTokens,
      refreshed: true,
    };
  } catch (error: any) {
    const error_code = String(error?.code ?? 'exception');
    const error_description = String(error?.message ?? '');
    console.error(JSON.stringify({
      event: 'token_refresh_failed',
      provider: 'microsoft',
      userId,
      error_code,
      error_description: error_description.slice(0, 200),
    }));
    return {
      status: 'retryable_failure',
      error_code,
      error_description,
      http_status: null,
    };
  }
}

export async function getMicrosoftTokensWithRefreshOutcome(
  userId: string,
): Promise<MicrosoftRefreshOutcome> {
  const row = await getStoredMicrosoftTokenRow(userId);
  if (!row) {
    return {
      status: 'missing_refresh_token',
      error_code: 'no_token_row',
      error_description: 'No Microsoft token row exists for this user.',
      reauth_required_at: null,
    };
  }

  if (row.oauth_reauth_required_at) {
    return {
      status: 'fatal_reauth_required',
      error_code: 'reauth_required',
      error_description: 'Microsoft requires an interactive reconnect for this token.',
      http_status: null,
      reauth_required_at: row.oauth_reauth_required_at,
    };
  }

  if (!row.access_token) {
    return {
      status: 'missing_refresh_token',
      error_code: 'missing_access_token',
      error_description: 'Microsoft connector row is missing an access token.',
      reauth_required_at: null,
    };
  }

  if (!row.refresh_token) {
    return {
      status: 'missing_refresh_token',
      error_code: 'no_refresh_token',
      error_description: 'Microsoft connector row is missing a refresh token.',
      reauth_required_at: null,
    };
  }

  const tokens: MicrosoftTokens = {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at ?? 0,
  };

  if (tokens.expires_at && tokens.expires_at < Date.now() / 1000 + 6 * 3600) {
    return refreshMicrosoftTokens(userId, tokens, row.email ?? undefined);
  }

  return {
    status: 'ok',
    tokens,
    refreshed: false,
  };
}

/**
 * Force Microsoft token refresh (e.g. after Graph 401) regardless of stored expiry skew.
 */
export async function forceRefreshMicrosoftTokens(userId: string): Promise<MicrosoftTokens | null> {
  const row = await getStoredMicrosoftTokenRow(userId);
  if (!row?.access_token || !row.refresh_token) return null;
  const outcome = await refreshMicrosoftTokens(
    userId,
    {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expires_at: row.expires_at ?? 0,
    },
    row.email ?? undefined,
  );
  return outcome.status === 'ok' ? outcome.tokens : null;
}

/**
 * Checks if a user has connected a specific provider.
 * Reads from user_tokens table.
 */
export async function hasIntegration(userId: string, provider: 'google' | 'azure_ad'): Promise<boolean> {
  // Map integrations provider name to user_tokens provider name
  const utProvider = provider === 'azure_ad' ? 'microsoft' : provider;
  const row = await getUserToken(userId, utProvider as 'google' | 'microsoft');
  return !!row;
}
