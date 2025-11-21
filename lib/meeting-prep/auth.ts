// =====================================================
// FOLDERA MEETING PREP - Authentication Utilities
// Handles NextAuth configuration and token management
// =====================================================

import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createClient } from '@supabase/supabase-js';
import type { MeetingPrepUser } from '@/types/meeting-prep';

// Initialize Supabase client with service role (for server-side operations)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Google OAuth Scopes Required
 * These must match what's configured in Google Cloud Console
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive', // Full access for Janitor feature
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

/**
 * NextAuth Configuration
 * Handles Google OAuth and token management
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: 'offline', // Get refresh token
          prompt: 'consent', // Force consent screen to get refresh token
        },
      },
    }),
  ],
  
  callbacks: {
    /**
     * JWT Callback
     * Called whenever a JWT is created or updated
     * Store Google tokens in JWT for later use
     */
    async jwt({ token, account, user, profile }) {
      // Initial sign in
      if (account && user) {
        console.log('[Auth] Initial sign in for', user.email);
        
        // Store Google tokens
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at; // Unix timestamp
        token.email = user.email;
        token.name = user.name;
        
        // Create or update user in database
        try {
          await upsertMeetingPrepUser({
            email: user.email!,
            name: user.name || null,
            google_access_token: account.access_token!,
            google_refresh_token: account.refresh_token!,
            google_token_expires_at: new Date(account.expires_at! * 1000).toISOString(),
          });
        } catch (error) {
          console.error('[Auth] Error upserting user:', error);
        }
      }
      
      // Check if token needs refresh
      if (token.expiresAt && Date.now() > (token.expiresAt as number) * 1000) {
        console.log('[Auth] Token expired, refreshing...');
        try {
          const refreshedToken = await refreshGoogleToken(token.refreshToken as string);
          token.accessToken = refreshedToken.access_token;
          token.expiresAt = refreshedToken.expires_at;
          
          // Update in database
          await updateUserTokens(token.email as string, {
            google_access_token: refreshedToken.access_token,
            google_token_expires_at: new Date(refreshedToken.expires_at * 1000).toISOString(),
          });
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
  },
  
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Upsert Meeting Prep User
 * Creates or updates user in database
 */
async function upsertMeetingPrepUser(userData: {
  email: string;
  name: string | null;
  google_access_token: string;
  google_refresh_token: string;
  google_token_expires_at: string;
}): Promise<MeetingPrepUser> {
  // TODO: Encrypt tokens before storing
  // For now, storing as-is (add encryption in production!)
  
  const { data, error } = await supabase
    .from('meeting_prep_users')
    .upsert({
      email: userData.email,
      name: userData.name,
      google_access_token: userData.google_access_token,
      google_refresh_token: userData.google_refresh_token,
      google_token_expires_at: userData.google_token_expires_at,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'email',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[Auth] Error upserting user:', error);
    throw new Error(`Failed to create/update user: ${error.message}`);
  }
  
  const meetingPrepUser = data as MeetingPrepUser;
  
  // Update integrations table: Gmail and Google Drive are enabled when user logs in with Google
  try {
    const now = new Date().toISOString();
    
    // Upsert Gmail integration
    await supabase
      .from('integrations')
      .upsert({
        user_id: meetingPrepUser.id,
        provider: 'gmail',
        is_active: true,
        credentials: {
          access_token: userData.google_access_token,
          refresh_token: userData.google_refresh_token,
          expires_at: userData.google_token_expires_at,
        },
        last_synced_at: now,
        sync_status: 'idle',
        updated_at: now,
      }, {
        onConflict: 'user_id,provider',
      });
    
    // Upsert Google Drive integration
    await supabase
      .from('integrations')
      .upsert({
        user_id: meetingPrepUser.id,
        provider: 'google_drive',
        is_active: true,
        credentials: {
          access_token: userData.google_access_token,
          refresh_token: userData.google_refresh_token,
          expires_at: userData.google_token_expires_at,
        },
        last_synced_at: now,
        sync_status: 'idle',
        updated_at: now,
      }, {
        onConflict: 'user_id,provider',
      });
    
    console.log('[Auth] Updated integrations for Gmail and Google Drive');
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
    google_access_token: string;
    google_token_expires_at: string;
  }
): Promise<void> {
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
  const { data, error } = await supabase
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
  const { data, error } = await supabase
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
  const user = await getMeetingPrepUserById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!user.google_access_token || !user.google_refresh_token) {
    throw new Error('User has not connected Google account');
  }
  
  // Check if token is expired
  const expiresAt = new Date(user.google_token_expires_at!);
  const now = new Date();
  
  if (expiresAt <= now) {
    // Token expired, refresh it
    console.log('[Auth] Access token expired, refreshing...');
    const refreshed = await refreshGoogleToken(user.google_refresh_token);
    
    // Update in database
    await updateUserTokens(user.email, {
      google_access_token: refreshed.access_token,
      google_token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    });
    
    return refreshed.access_token;
  }
  
  return user.google_access_token;
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

