
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
    refresh_token: string;
    expires_at: number; // Unix timestamp (seconds)
  };

  // 2. Check expiration
  const now = Math.floor(Date.now() / 1000);
  // Add 5 minute buffer
  if (credentials.expires_at - 300 > now) {
    return credentials.access_token;
  }

  // 3. Refresh if expired
  console.log('[Auth] Microsoft token expired, refreshing...');
  const refreshed = await refreshMicrosoftToken(credentials.refresh_token);

  // 4. Update database
  await (supabase
    .from('integrations') as any)
    .update({
      credentials: {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || credentials.refresh_token, // Use new one if provided, else keep old
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
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
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

