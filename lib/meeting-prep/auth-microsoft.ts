
import { createClient } from '@supabase/supabase-js';

// Lazy Supabase client
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error('Supabase environment variables not loaded.');
    }
    
    supabase = createClient(url, key);
  }
  return supabase;
}

/**
 * Get Microsoft Access Token for User
 * 
 * Fetches valid access token from 'integrations' table.
 * Handles token refresh if expired.
 */
export async function getMicrosoftAccessToken(userId: string): Promise<string> {
  const supabase = getSupabaseClient();
  
  // 1. Get credentials from integrations table
  // Explicitly select credentials to avoid type errors with single()
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('credentials, updated_at')
    .eq('user_id', userId)
    .eq('provider', 'azure_ad') // or 'outlook' depending on what we set
    .single();

  if (error || !integration) {
    throw new Error('User has not connected Microsoft Outlook');
  }

  const record = integration as any;
  const credentials = record.credentials as {
    access_token: string;
    refresh_token: string | null; // Can be null if offline_access not granted
    expires_at: number; // Unix timestamp (seconds)
  };

  // 2. Import decryption utility
  const { decryptToken, encryptToken } = await import('@/lib/crypto/token-encryption');

  // 3. Decrypt tokens from database (check for null refresh token)
  const decryptedAccessToken = decryptToken(credentials.access_token);
  const decryptedRefreshToken = credentials.refresh_token 
    ? decryptToken(credentials.refresh_token)
    : null; // Handle missing refresh token

  // 4. Check expiration
  const now = Math.floor(Date.now() / 1000);
  // Add 5 minute buffer
  if (credentials.expires_at - 300 > now) {
    return decryptedAccessToken;
  }

  // 5. Refresh if expired
  console.log('[Auth] Microsoft token expired, refreshing...');
  
  // Cannot refresh without a refresh token
  if (!decryptedRefreshToken) {
    throw new Error('Cannot refresh token: refresh_token not available. User must re-authenticate.');
  }
  
  const refreshed = await refreshMicrosoftToken(decryptedRefreshToken);

  // 6. Encrypt refreshed tokens before storing
  const encryptedAccessToken = encryptToken(refreshed.access_token);
  const encryptedRefreshToken = refreshed.refresh_token 
    ? encryptToken(refreshed.refresh_token) 
    : credentials.refresh_token; // Keep old encrypted token if no new one provided

  // 7. Update database with encrypted tokens
  await (supabase
    .from('integrations') as any)
    .update({
      credentials: {
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', 'azure_ad');

  return refreshed.access_token;
}

/**
 * Refresh Microsoft Graph Token
 */
async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const tenantId = process.env.AZURE_AD_TENANT_ID || 'common';
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'openid profile email User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Microsoft token refresh failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error('[Auth] Error refreshing Microsoft token:', error);
    throw error;
  }
}

