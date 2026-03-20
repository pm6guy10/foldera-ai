import { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { resolveSupabaseAuthUserId } from '@/lib/auth/supabase-auth-user';

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

/**
 * Silently refresh an expired Google access token using the stored refresh token.
 * Returns the updated token fields, or sets an error flag if refresh fails.
 */
async function refreshGoogleToken(token: JWT): Promise<JWT> {
  try {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken as string,
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[auth] Google token refresh failed:', data);
      return { ...token, error: 'RefreshAccessTokenError' };
    }
    const newAccessToken = data.access_token;
    const newExpiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);
    const newRefreshToken = data.refresh_token ?? token.refreshToken;

    // Persist refreshed tokens to user_tokens so background sync jobs use the fresh token
    if (token.userId && typeof token.userId === 'string') {
      try {
        const { saveUserToken } = await import('@/lib/auth/user-tokens');
        await saveUserToken(token.userId, 'google', {
          access_token: newAccessToken,
          refresh_token: newRefreshToken as string,
          expires_at: newExpiresAt,
        });
        console.log('[auth] Google token refreshed + persisted to user_tokens');
      } catch (persistErr) {
        console.error('[auth] Google token refreshed but user_tokens persist failed:', persistErr);
      }
    } else {
      console.log('[auth] Google token refreshed silently (no userId for persist)');
    }

    return {
      ...token,
      accessToken: newAccessToken,
      expiresAt: newExpiresAt,
      refreshToken: newRefreshToken,
    };
  } catch (err) {
    console.error('[auth] Google token refresh threw:', err);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

/**
 * Silently refresh an expired Microsoft access token using the stored refresh token.
 */
async function refreshMicrosoftToken(token: JWT): Promise<JWT> {
  try {
    const tenantId = process.env.AZURE_AD_TENANT_ID || 'common';
    const params = new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID || '',
      client_secret: process.env.AZURE_AD_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken as string,
      scope: 'openid profile email User.Read Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Tasks.Read offline_access',
    });
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[auth] Microsoft token refresh failed:', data);
      return { ...token, error: 'RefreshAccessTokenError' };
    }
    const newAccessToken = data.access_token;
    const newExpiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600);
    const newRefreshToken = data.refresh_token ?? token.refreshToken;

    // Persist refreshed tokens to user_tokens so background sync jobs use the fresh token
    if (token.userId && typeof token.userId === 'string') {
      try {
        const { saveUserToken } = await import('@/lib/auth/user-tokens');
        await saveUserToken(token.userId, 'microsoft', {
          access_token: newAccessToken,
          refresh_token: newRefreshToken as string,
          expires_at: newExpiresAt,
        });
        console.log('[auth] Microsoft token refreshed + persisted to user_tokens');
      } catch (persistErr) {
        console.error('[auth] Microsoft token refreshed but user_tokens persist failed:', persistErr);
      }
    } else {
      console.log('[auth] Microsoft token refreshed silently (no userId for persist)');
    }

    return {
      ...token,
      accessToken: newAccessToken,
      expiresAt: newExpiresAt,
      refreshToken: newRefreshToken,
    };
  } catch (err) {
    console.error('[auth] Microsoft token refresh threw:', err);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

function getProductionSessionCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== 'production') {
    return undefined;
  }

  const rawBaseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL;
  if (!rawBaseUrl) {
    return undefined;
  }

  try {
    const hostname = new URL(rawBaseUrl).hostname.toLowerCase();
    if (hostname === 'foldera.ai' || hostname.endsWith('.foldera.ai')) {
      return '.foldera.ai';
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getAuthOptions(): NextAuthOptions {
  const useSecureCookies = process.env.NODE_ENV === 'production';
  const cookieDomain = getProductionSessionCookieDomain();
  const providers: any[] = [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/drive.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ];

  if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
    providers.push(
      AzureADProvider({
        clientId: process.env.AZURE_AD_CLIENT_ID,
        clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
        tenantId: process.env.AZURE_AD_TENANT_ID || 'common',
        authorization: {
          params: {
            scope: 'openid profile email User.Read Mail.Read Mail.ReadWrite Mail.Send Calendars.Read Calendars.ReadWrite Files.Read Tasks.Read offline_access',
          },
        },
      })
    );
  }

  return {
    providers,
    logger: {
      error(code, metadata) {
        console.error(`[NextAuth][error][${code}]`, metadata);
      },
      warn(code) {
        console.warn(`[NextAuth][warn][${code}]`);
      },
      debug(code, metadata) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[NextAuth][debug][${code}]`, metadata);
        }
      },
    },
    callbacks: {
      async signIn({ account }) {
        console.log(`[auth] signIn callback — provider: ${account?.provider}`);
        return true;
      },
      async jwt({ token, account, user }) {
        try {
          if (account && user) {
            // --- Initial sign-in: store OAuth tokens in JWT ---
            console.log(`[auth][jwt] INITIAL SIGN-IN — provider: ${account.provider}, email: ${user.email}, has_access_token: ${!!account.access_token}, has_refresh_token: ${!!account.refresh_token}, expires_at: ${account.expires_at}, scope: ${(account as any).scope ?? 'none'}`);
            token.accessToken = account.access_token;
            token.refreshToken = account.refresh_token;
            token.expiresAt = account.expires_at;
            token.email = user.email;
            token.name = user.name;
            token.provider = account.provider;

            if (!user.email) {
              console.error('[auth][jwt] ABORT — OAuth profile missing email');
              throw new Error('OAuth profile missing email');
            }

            // Session-backed routes rely on session.user.id being a real auth.users UUID.
            console.log(`[auth][jwt] resolving Supabase user for ${user.email}...`);
            const resolvedUserId = await resolveSupabaseAuthUserId(
              user.email,
              user.name,
            );
            token.userId = resolvedUserId;
            console.log(`[auth][jwt] resolved userId: ${resolvedUserId}`);

            // Persist OAuth tokens to user_tokens so background
            // cron jobs (sync-email, etc.) can retrieve them without a session.
            try {
              const { saveUserToken } = await import('@/lib/auth/user-tokens');
              if (resolvedUserId && account.access_token) {
                if (account.provider === 'google') {
                  console.log(`[auth][jwt][google] persisting to user_tokens — userId: ${resolvedUserId}, has_refresh: ${!!account.refresh_token}`);
                  await saveUserToken(resolvedUserId, 'google', {
                    access_token: account.access_token,
                    refresh_token: account.refresh_token ?? '',
                    expires_at: account.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                    email: user.email ?? undefined,
                    scopes: (account as any).scope ?? '',
                  });
                  console.log(`[auth][jwt][google] user_tokens upsert OK`);
                } else if (account.provider === 'azure-ad') {
                  console.log(`[auth][jwt][microsoft] persisting to user_tokens — userId: ${resolvedUserId}, has_refresh: ${!!account.refresh_token}`);
                  await saveUserToken(resolvedUserId, 'microsoft', {
                    access_token: account.access_token,
                    refresh_token: account.refresh_token ?? '',
                    expires_at: account.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                    email: user.email ?? undefined,
                    scopes: (account as any).scope ?? '',
                  });
                  console.log(`[auth][jwt][microsoft] user_tokens upsert OK`);
                }
                console.log(`[auth][jwt] Token persist COMPLETE for ${account.provider}`);
              } else {
                console.warn(`[auth][jwt] SKIPPED token persist — missing: userId=${!!resolvedUserId} access=${!!account.access_token}`);
              }
            } catch (err: any) {
              // Non-fatal — JWT still works; log and move on
              console.error(`[auth][jwt] FAILED to persist OAuth tokens: ${err.message}`, err.stack ?? '');
            }
          } else if (token.expiresAt && token.refreshToken) {
            // --- Subsequent request: check if access token needs refresh ---
            const expiresAt = typeof token.expiresAt === 'number' ? token.expiresAt : 0;
            const nowSec = Math.floor(Date.now() / 1000);
            // Refresh 5 minutes before actual expiry to avoid edge-case failures
            if (nowSec >= expiresAt - 300) {
              if (token.provider === 'google') {
                return await refreshGoogleToken(token);
              } else if (token.provider === 'azure-ad') {
                return await refreshMicrosoftToken(token);
              }
            }
          }
          return token;
        } catch (outerErr) {
          // Catch-all: if anything in the jwt callback throws, log it
          // and still return the token so the sign-in doesn't break.
          console.error('[auth] CRITICAL — jwt callback threw:', outerErr);
          return token;
        }
      },
      async session({ session, token }) {
        // Use the resolved Supabase UUID stored during sign-in.
        session.user.id = typeof token.userId === 'string' ? token.userId : '';
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        return session;
      },
      async redirect({ url, baseUrl }) {
        if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/dashboard`;
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        if (url.startsWith(baseUrl)) return url;
        return `${baseUrl}/dashboard`;
      },
    },
    pages: {
      signIn: '/start',
    },
    session: {
      strategy: 'jwt',
      maxAge: THIRTY_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    jwt: {
      maxAge: THIRTY_DAYS_IN_SECONDS,
    },
    cookies: {
      sessionToken: {
        name: `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: useSecureCookies,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        },
      },
      callbackUrl: {
        name: `${useSecureCookies ? '__Secure-' : ''}next-auth.callback-url`,
        options: {
          sameSite: 'lax',
          path: '/',
          secure: useSecureCookies,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        },
      },
      csrfToken: {
        // Use __Secure- (not default __Host-) so the domain attribute is allowed.
        name: `${useSecureCookies ? '__Secure-' : ''}next-auth.csrf-token`,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: useSecureCookies,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        },
      },
      state: {
        name: `${useSecureCookies ? '__Secure-' : ''}next-auth.state`,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: useSecureCookies,
          maxAge: 900,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        },
      },
      pkceCodeVerifier: {
        name: `${useSecureCookies ? '__Secure-' : ''}next-auth.pkce.code_verifier`,
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: useSecureCookies,
          maxAge: 900,
          ...(cookieDomain ? { domain: cookieDomain } : {}),
        },
      },
    },
    secret: process.env.NEXTAUTH_SECRET,
  };
}

export const authOptions = getAuthOptions();
