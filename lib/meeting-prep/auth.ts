// =====================================================
// FOLDERA MEETING PREP - Authentication Utilities
// Handles NextAuth configuration and token management
// =====================================================

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { createClient } from '@supabase/supabase-js';
import type { MeetingPrepUser } from '@/types/meeting-prep';

// Note: Supabase client is initialized lazily to avoid module-load errors

// Lazy Supabase client initialization (for server-side operations)
// This prevents module-level initialization errors when env vars aren't loaded yet
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!url || !key) {
      throw new Error('Supabase environment variables not loaded. NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    }
    
    supabase = createClient(url, key);
    console.log("✅ Supabase client initialized successfully");
  }
  return supabase;
}

/**
 * Google OAuth Scopes Required
 * These must match what's configured in Google Cloud Console
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar', // Full access for Calendar Actuator
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive', // Full access for Janitor feature
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

/**
 * NextAuth Configuration
 * Handles Google OAuth and token management
 * Made dynamic to avoid caching old keys
 */
export function getAuthOptions(): NextAuthOptions {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const azureClientId = process.env.AZURE_AD_CLIENT_ID;
  const azureClientSecret = process.env.AZURE_AD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ [Auth] CRITICAL ERROR: Google Keys Missing in lib/meeting-prep/auth.ts");
    console.error("   - GOOGLE_CLIENT_ID:", clientId ? "✅ Present" : "❌ Missing");
    console.error("   - GOOGLE_CLIENT_SECRET:", clientSecret ? "✅ Present" : "❌ Missing");
    // We won't throw here to allow the app to build, but auth will fail.
  }

  const providers: any[] = [
    GoogleProvider({
      clientId: clientId || '',
      clientSecret: clientSecret || '',
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: 'offline', // Get refresh token
          prompt: 'consent', // Force consent screen to get refresh token
        },
      },
    }),
  ];

  if (azureClientId && azureClientSecret) {
    providers.push(
      AzureADProvider({
        clientId: azureClientId,
        clientSecret: azureClientSecret,
        allowDangerousEmailAccountLinking: true,
        tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
        authorization: {
          params: {
            scope: "openid profile email User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access",
          },
        },
      })
    );
  }

  return {
    providers,
  
  callbacks: {
    /**
     * JWT Callback
     * Called whenever a JWT is created or updated
     * Store Google tokens in JWT for later use
     */
    async jwt({ token, account, user, profile }) {
      // Initial sign in
      if (account && user) {
        console.log('[Auth] Initial sign in for', user.email, 'via', account.provider);
        
        // Store tokens
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at; // Unix timestamp
        token.email = user.email;
        token.name = user.name;
        token.provider = account.provider; // Track provider
        
        // Safe expiration handling
        let expiresAtIso = new Date().toISOString();
        if (account.expires_at) {
          expiresAtIso = new Date(account.expires_at * 1000).toISOString();
        } else if (account.expires_in) {
           // Some providers return expires_in (seconds duration)
           expiresAtIso = new Date(Date.now() + (account.expires_in as number) * 1000).toISOString();
        }

        // Create or update user in database
        try {
          // Normalize provider
          let normalizedProvider: 'google' | 'azure-ad' = 'google';
          if (account.provider.includes('azure') || account.provider.includes('microsoft')) {
            normalizedProvider = 'azure-ad';
          }

          console.log(`[Auth] Upserting user ${user.email} with provider ${normalizedProvider} (raw: ${account.provider})`);

          await upsertMeetingPrepUser({
            email: user.email!,
            name: user.name || null,
            provider: normalizedProvider,
            tokens: {
              access_token: account.access_token!,
              refresh_token: account.refresh_token!, // might be undefined if not offline
              expires_at: expiresAtIso,
            }
          });
        } catch (error) {
          console.error('[Auth] Error upserting user:', error);
        }
      }
      
      // Check if token needs refresh
      if (token.expiresAt && Date.now() > (token.expiresAt as number) * 1000) {
        console.log('[Auth] Token expired, refreshing...');
        try {
          // Choose refresh logic based on provider
          // Note: NextAuth JWTs don't persist 'account' object, so we rely on token.provider if we saved it,
          // OR we assume google if not set (legacy)
          const provider = (token.provider as string) || 'google';

          if (provider === 'google') {
             const { decryptToken, encryptToken } = await import('@/lib/crypto/token-encryption');
             const decryptedRefreshToken = decryptToken(token.refreshToken as string);
             const refreshedToken = await refreshGoogleToken(decryptedRefreshToken);
             token.accessToken = refreshedToken.access_token;
             token.expiresAt = refreshedToken.expires_at;
             
             // Encrypt and update in database
             await updateUserTokens(token.email as string, {
               google_access_token: encryptToken(refreshedToken.access_token),
               google_token_expires_at: new Date(refreshedToken.expires_at * 1000).toISOString(),
             });
          } else if (provider === 'azure-ad') {
             // For Azure, we handle refresh via our helper or similar logic
             // But for now, let's just log. 
             // Ideally we should import refreshMicrosoftToken from auth-microsoft.ts
             // But that might create circular deps if auth-microsoft imports auth.ts (it doesn't currently)
             console.log('[Auth] Azure token refresh in JWT callback not yet fully implemented - relying on Actuator refresh');
          }

        } catch (error) {
          console.error('[Auth] Error refreshing token:', error);
          // Token refresh failed - user needs to re-authenticate
          token.error = 'RefreshAccessTokenError';
        }
      }
      
      return token;
    },
    
    /**
     * Session Callback
     * Expose necessary data to client
     */
    async session({ session, token }) {
      // Add user ID and error status to session
      session.user.id = token.sub!;
      session.user.email = token.email as string;
      session.user.name = token.name as string;
      session.error = token.error as string | undefined;
      
      return session;
    },
    
    /**
     * Redirect Callback
     * Redirect users to /dashboard/settings after successful login
     * Respects explicit callbackUrl if provided, otherwise defaults to settings
     */
    async redirect({ url, baseUrl }) {
      // If url is the base URL (no specific path) or homepage, redirect to settings
      if (url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/dashboard/settings`;
      }
      
      // If callbackUrl is provided and valid, use it
      if (url.startsWith(baseUrl) || url.startsWith('/')) {
        // Resolve relative URLs
        if (url.startsWith('/')) {
          return `${baseUrl}${url}`;
        }
        return url;
      }
      
      // Default: redirect to settings page
      return `${baseUrl}/dashboard/settings`;
    },
  },
  
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' 
        ? `__Secure-next-auth.session-token`
        : `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60, // 30 days - persist cookie
      },
    },
  },
  
  secret: process.env.NEXTAUTH_SECRET,
  };
}

// Export as getter for backwards compatibility (reads fresh env vars on each access)
export const authOptions = getAuthOptions();

/**
 * Upsert Meeting Prep User
 * Creates or updates user in database
 */
async function upsertMeetingPrepUser(userData: {
  email: string;
  name: string | null;
  provider: 'google' | 'azure-ad';
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  };
}): Promise<MeetingPrepUser> {
  // Encrypt tokens before storing
  const { encryptToken } = await import('@/lib/crypto/token-encryption');
  
  const supabase = getSupabaseClient();
  
  // Prepare user update data
  const userUpdate: any = {
    email: userData.email,
    name: userData.name,
    updated_at: new Date().toISOString(),
  };

  // Only update Google columns if provider is Google
  if (userData.provider === 'google') {
    // Encrypt tokens before storing
    userUpdate.google_access_token = encryptToken(userData.tokens.access_token);
    userUpdate.google_refresh_token = encryptToken(userData.tokens.refresh_token);
    userUpdate.google_token_expires_at = userData.tokens.expires_at;
  }

  const { data, error } = await supabase
    .from('meeting_prep_users')
    .upsert(userUpdate, {
      onConflict: 'email',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Auth] Error upserting user:', error);
    throw new Error(`Failed to create/update user: ${error.message}`);
  }
  
  const meetingPrepUser = data as MeetingPrepUser;
  
  // Update integrations table
  try {
    const now = new Date().toISOString();
    
    // Check if we have tokens (refresh token is critical)
    if (!userData.tokens.access_token) {
        console.warn(`[Auth] No access token for ${userData.email}, skipping integration update`);
        return meetingPrepUser;
    }

    const credentials = {
        access_token: userData.tokens.access_token,
        refresh_token: userData.tokens.refresh_token || '', // Handle missing refresh token
        expires_at: Math.floor(new Date(userData.tokens.expires_at).getTime() / 1000),
    };

    if (userData.provider === 'google') {
      // Upsert Gmail integration
      await supabase.from('integrations').upsert({
          user_id: meetingPrepUser.id,
          provider: 'gmail',
          is_active: true,
          credentials,
          last_synced_at: now,
          sync_status: 'idle',
          updated_at: now,
        } as any, { onConflict: 'user_id,provider' });
      
      // Upsert Google Drive integration
      await supabase.from('integrations').upsert({
          user_id: meetingPrepUser.id,
          provider: 'google_drive',
          is_active: true,
          credentials,
          last_synced_at: now,
          sync_status: 'idle',
          updated_at: now,
        } as any, { onConflict: 'user_id,provider' });

    } else if (userData.provider === 'azure-ad') {
       // Upsert Outlook integration
       const { error: intError } = await supabase.from('integrations').upsert({
          user_id: meetingPrepUser.id,
          provider: 'azure_ad', // Must match check in auth-microsoft.ts
          is_active: true,
          credentials,
          last_synced_at: now,
          sync_status: 'idle',
          updated_at: now,
        } as any, { onConflict: 'user_id,provider' });

        if (intError) {
            console.error('[Auth] Supabase error updating Azure integration:', intError);
        } else {
            console.log('[Auth] Successfully updated Azure integration record');
        }
    }
    
    console.log(`[Auth] Updated integrations for ${userData.provider}`);
  } catch (integrationError: any) {
    // Don't fail the login if integration update fails
    console.error('[Auth] Error updating integrations:', integrationError);
  }
  
  return meetingPrepUser;
}

/**
 * Update User Tokens
 * Updates only the Google tokens for a user
 */
async function updateUserTokens(
  email: string,
  tokens: {
    google_access_token: string; // Should already be encrypted when passed
    google_token_expires_at: string;
  }
): Promise<void> {
  const supabase = getSupabaseClient() as any;
  const { error } = await supabase
    .from('meeting_prep_users')
    .update({
      ...tokens,
      updated_at: new Date().toISOString(),
    })
    .eq('email', email);
  
  if (error) {
    console.error('[Auth] Error updating tokens:', error);
    throw new Error(`Failed to update tokens: ${error.message}`);
  }
}

/**
 * Refresh Google Access Token
 * Uses refresh token to get new access token
 */
async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  expires_at: number;
}> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      access_token: data.access_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    };
  } catch (error) {
    console.error('[Auth] Error refreshing Google token:', error);
    throw error;
  }
}

/**
 * Get User By Email
 * Fetch user data from database
 */
export async function getMeetingPrepUser(email: string): Promise<MeetingPrepUser | null> {
  const { data, error } = await getSupabaseClient()
    .from('meeting_prep_users')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('[Auth] Error fetching user:', error);
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
  
  return data as MeetingPrepUser;
}

/**
 * Get User By ID
 */
export async function getMeetingPrepUserById(userId: string): Promise<MeetingPrepUser | null> {
  const { data, error } = await getSupabaseClient()
    .from('meeting_prep_users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('[Auth] Error fetching user by ID:', error);
    throw new Error(`Failed to fetch user: ${error.message}`);
  }
  
  return data as MeetingPrepUser;
}

/**
 * Get Google Access Token for User
 * Returns valid access token (refreshes if needed)
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const { decryptToken } = await import('@/lib/crypto/token-encryption');
  
  const user = await getMeetingPrepUserById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!user.google_access_token || !user.google_refresh_token) {
    throw new Error('User has not connected Google account');
  }
  
  // Decrypt refresh token for use
  const decryptedRefreshToken = decryptToken(user.google_refresh_token);
  
  // Check if token is expired
  const expiresAt = new Date(user.google_token_expires_at!);
  const now = new Date();
  
  if (expiresAt <= now) {
    // Token expired, refresh it
    console.log('[Auth] Access token expired, refreshing...');
    const refreshed = await refreshGoogleToken(decryptedRefreshToken);
    
    // Encrypt and update in database
    const { encryptToken } = await import('@/lib/crypto/token-encryption');
    await updateUserTokens(user.email, {
      google_access_token: encryptToken(refreshed.access_token),
      google_token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    });
    
    return refreshed.access_token;
  }
  
  // Decrypt and return access token
  return decryptToken(user.google_access_token);
}

/**
 * Check if User Has Valid Google Connection
 */
export async function hasValidGoogleConnection(userId: string): Promise<boolean> {
  try {
    const user = await getMeetingPrepUserById(userId);
    return !!(user?.google_access_token && user?.google_refresh_token);
  } catch (error) {
    return false;
  }
}

