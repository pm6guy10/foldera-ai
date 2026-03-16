import { createServerClient } from '@/lib/db/client';
import { google } from 'googleapis';
import { decryptToken, isEncrypted } from '@/lib/crypto/token-encryption';
import { encryptToken } from '@/lib/crypto/token-encryption';


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
 * Retrieves and refreshes Google tokens for a user
 */
export async function getGoogleTokens(userId: string): Promise<GoogleTokens | null> {
  const { data, error } = await createServerClient()
    .from('integrations')
    .select('credentials')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();
  
  if (error || !data) {
    return null;
  }
  
  const credentials = data.credentials as any;
  
  // Handle encrypted tokens
  let tokens: GoogleTokens;
  if (credentials.access_token && isEncrypted(credentials.access_token)) {
    tokens = {
      access_token: decryptToken(credentials.access_token),
      refresh_token: credentials.refresh_token ? 
        (isEncrypted(credentials.refresh_token) ? decryptToken(credentials.refresh_token) : credentials.refresh_token) 
        : '',
      expiry_date: credentials.expires_at || credentials.expiry_date || 0,
    };
  } else {
    tokens = credentials as GoogleTokens;
  }
  
  // Check if token needs refresh (5 min buffer)
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 5 * 60 * 1000) {
    return await refreshGoogleTokens(userId, tokens);
  }
  
  return tokens;
}

/**
 * Refreshes Google tokens
 */
async function refreshGoogleTokens(userId: string, tokens: GoogleTokens): Promise<GoogleTokens | null> {
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
      expiry_date: credentials.expiry_date || Date.now() + 3600 * 1000,
    };
    
    // Encrypt and update in database
    const encryptedCredentials = {
      access_token: encryptToken(newTokens.access_token),
      refresh_token: encryptToken(newTokens.refresh_token),
      expires_at: newTokens.expiry_date,
    };
    
    await createServerClient()
      .from('integrations')
      .update({ credentials: encryptedCredentials })
      .eq('user_id', userId)
      .eq('provider', 'google');
    
    return newTokens;
  } catch (error) {
    console.error('Failed to refresh Google tokens:', error);
    return null;
  }
}

/**
 * Retrieves and refreshes Microsoft tokens for a user
 */
export async function getMicrosoftTokens(userId: string): Promise<MicrosoftTokens | null> {
  const { data, error } = await createServerClient()
    .from('integrations')
    .select('credentials')
    .eq('user_id', userId)
    .eq('provider', 'azure_ad')
    .single();
  
  if (error || !data) {
    return null;
  }
  
  const credentials = data.credentials as any;
  
  // Handle encrypted tokens
  let tokens: MicrosoftTokens;
  if (credentials.access_token && isEncrypted(credentials.access_token)) {
    tokens = {
      access_token: decryptToken(credentials.access_token),
      refresh_token: credentials.refresh_token ? 
        (isEncrypted(credentials.refresh_token) ? decryptToken(credentials.refresh_token) : credentials.refresh_token) 
        : '',
      expires_at: credentials.expires_at || 0,
    };
  } else {
    tokens = credentials as MicrosoftTokens;
  }
  
  // Check if token needs refresh (5 min buffer)
  if (tokens.expires_at && tokens.expires_at < Date.now() / 1000 + 5 * 60) {
    return await refreshMicrosoftTokens(userId, tokens);
  }
  
  return tokens;
}

/**
 * Refreshes Microsoft tokens
 */
async function refreshMicrosoftTokens(userId: string, tokens: MicrosoftTokens): Promise<MicrosoftTokens | null> {
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

      // If refresh token is expired/revoked, mark integration as needing re-auth
      if (response.status === 400 || response.status === 401) {
        console.error('[token-store] Refresh token expired or revoked — marking integration inactive');
        await createServerClient()
          .from('integrations')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('provider', 'azure_ad');
      }
      return null;
    }

    const data = await response.json();

    const newTokens: MicrosoftTokens = {
      access_token: data.access_token,
      // Azure AD may or may not return a new refresh token — always prefer new one
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    };

    // Encrypt and update in database
    const encryptedCredentials = {
      access_token: encryptToken(newTokens.access_token),
      refresh_token: encryptToken(newTokens.refresh_token),
      expires_at: newTokens.expires_at,
    };

    await createServerClient()
      .from('integrations')
      .update({ credentials: encryptedCredentials })
      .eq('user_id', userId)
      .eq('provider', 'azure_ad');

    console.log(`[token-store] Microsoft tokens refreshed for user ${userId}`);
    return newTokens;
  } catch (error) {
    console.error('[token-store] Failed to refresh Microsoft tokens:', error);
    return null;
  }
}

/**
 * Saves tokens after OAuth callback.
 * Uses select + update/insert instead of upsert to avoid requiring a
 * unique constraint on (user_id, provider).
 */
export async function saveTokens(
  userId: string,
  provider: 'google' | 'azure_ad',
  credentials: GoogleTokens | MicrosoftTokens
): Promise<void> {
  const supabase = createServerClient();

  // Encrypt tokens before storing
  const encryptedCredentials: any = {
    access_token: encryptToken(credentials.access_token),
    refresh_token: encryptToken(credentials.refresh_token),
  };

  if (provider === 'google') {
    encryptedCredentials.expires_at = (credentials as GoogleTokens).expiry_date;
  } else {
    encryptedCredentials.expires_at = (credentials as MicrosoftTokens).expires_at;
  }

  const now = new Date().toISOString();

  // Check for existing row first (works with or without a unique constraint)
  const { data: existing, error: selectErr } = await supabase
    .from('integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (selectErr) {
    console.error(`[token-store] select failed for ${provider}:`, selectErr.message);
    throw new Error(`Failed to check existing integration: ${selectErr.message}`);
  }

  if (existing) {
    const { error: updateErr } = await supabase
      .from('integrations')
      .update({
        credentials: encryptedCredentials,
        is_active: true,
        connected_at: now,
      })
      .eq('user_id', userId)
      .eq('provider', provider);
    if (updateErr) {
      console.error(`[token-store] update failed for ${provider}:`, updateErr.message);
      throw new Error(`Failed to update integration: ${updateErr.message}`);
    }
    console.log(`[token-store] Updated ${provider} tokens for user ${userId}`);
  } else {
    const { error: insertErr } = await supabase
      .from('integrations')
      .insert({
        user_id: userId,
        provider,
        credentials: encryptedCredentials,
        is_active: true,
        connected_at: now,
      });
    if (insertErr) {
      console.error(`[token-store] insert failed for ${provider}:`, insertErr.message);
      throw new Error(`Failed to insert integration: ${insertErr.message}`);
    }
    console.log(`[token-store] Inserted ${provider} tokens for user ${userId}`);
  }
}

/**
 * Checks if a user has connected a specific provider
 */
export async function hasIntegration(userId: string, provider: 'google' | 'azure_ad'): Promise<boolean> {
  const { data, error } = await createServerClient()
    .from('integrations')
    .select('user_id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();
  
  return !error && !!data;
}

