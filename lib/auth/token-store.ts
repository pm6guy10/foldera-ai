/**
 * token-store.ts
 *
 * Unified token retrieval for Google and Microsoft OAuth.
 * All reads/writes go through the `user_tokens` table.
 * The `integrations` table is deprecated — do not read from it.
 */

import { google } from 'googleapis';
import { getUserToken, saveUserToken } from '@/lib/auth/user-tokens';


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
  } catch (error) {
    console.error('[token-store] Failed to refresh Google tokens:', error);
    return null;
  }
}

/**
 * Retrieves and refreshes Microsoft tokens for a user.
 * Reads from user_tokens table.
 */
export async function getMicrosoftTokens(userId: string): Promise<MicrosoftTokens | null> {
  const row = await getUserToken(userId, 'microsoft');
  if (!row) return null;

  const tokens: MicrosoftTokens = {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
  };

  // Proactively refresh if token expires within 6 hours so background cron
  // runs never hit an expired token mid-execution (LESSONS_LEARNED rule #2).
  // Microsoft expires_at is stored as epoch seconds.
  if (tokens.expires_at && tokens.expires_at < Date.now() / 1000 + 6 * 3600) {
    return await refreshMicrosoftTokens(userId, tokens, row.email ?? undefined);
  }

  return tokens;
}

/**
 * Refreshes Microsoft tokens and persists to user_tokens.
 */
async function refreshMicrosoftTokens(userId: string, tokens: MicrosoftTokens, email?: string): Promise<MicrosoftTokens | null> {
  if (!tokens.refresh_token) {
    console.error('[token-store] No refresh token available for Microsoft — user must re-authenticate');
    return null;
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
      console.error(`[token-store] Microsoft token refresh failed (${response.status}): ${errorBody}`);
      return null;
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
    return newTokens;
  } catch (error) {
    console.error('[token-store] Failed to refresh Microsoft tokens:', error);
    return null;
  }
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
