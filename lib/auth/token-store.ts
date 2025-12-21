import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { decryptToken, isEncrypted } from '@/lib/crypto/token-encryption';
import { encryptToken } from '@/lib/crypto/token-encryption';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const { data, error } = await supabase
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
    
    await supabase
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
  const { data, error } = await supabase
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
  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_AD_CLIENT_ID!,
        client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    const newTokens: MicrosoftTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
    
    // Encrypt and update in database
    const encryptedCredentials = {
      access_token: encryptToken(newTokens.access_token),
      refresh_token: encryptToken(newTokens.refresh_token),
      expires_at: newTokens.expires_at,
    };
    
    await supabase
      .from('integrations')
      .update({ credentials: encryptedCredentials })
      .eq('user_id', userId)
      .eq('provider', 'azure_ad');
    
    return newTokens;
  } catch (error) {
    console.error('Failed to refresh Microsoft tokens:', error);
    return null;
  }
}

/**
 * Saves tokens after OAuth callback
 */
export async function saveTokens(
  userId: string,
  provider: 'google' | 'azure_ad',
  credentials: GoogleTokens | MicrosoftTokens
): Promise<void> {
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
  
  await supabase
    .from('integrations')
    .upsert({
      user_id: userId,
      provider,
      credentials: encryptedCredentials,
      connected_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,provider',
    });
}

/**
 * Checks if a user has connected a specific provider
 */
export async function hasIntegration(userId: string, provider: 'google' | 'azure_ad'): Promise<boolean> {
  const { data, error } = await supabase
    .from('integrations')
    .select('user_id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();
  
  return !error && !!data;
}

