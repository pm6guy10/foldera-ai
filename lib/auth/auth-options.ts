import { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { resolveSupabaseAuthUserId } from '@/lib/auth/supabase-auth-user';
import { createServerClient } from '@/lib/db/client';

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;
const ONBOARDING_SOURCES = ['onboarding_bucket', 'onboarding_stated', 'onboarding_marker'] as const;

async function setOnboardingClaim(token: JWT): Promise<JWT> {
  if (!token.userId || typeof token.userId !== 'string') {
    return { ...token, hasOnboarded: false };
  }

  try {
    const supabase = createServerClient();
    const { count, error } = await supabase
      .from('tkg_goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', token.userId)
      .in('source', [...ONBOARDING_SOURCES]);

    if (error) {
      throw error;
    }

    return {
      ...token,
      hasOnboarded: (count ?? 0) > 0,
    };
  } catch (err) {
    console.error('[auth][jwt] FAILED to load onboarding status:', err);
    return {
      ...token,
      hasOnboarded: false,
    };
  }
}

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
                return await setOnboardingClaim(await refreshGoogleToken(token));
              } else if (token.provider === 'azure-ad') {
                return await setOnboardingClaim(await refreshMicrosoftToken(token));
              }
            }
          }
          return await setOnboardingClaim(token);
        } catch (outerErr: any) {
          // Catch-all: if anything in the jwt callback throws, log it
          // and still return the token so the sign-in doesn't break.
          console.error('[auth] CRITICAL — jwt callback threw:', outerErr?.message ?? outerErr, outerErr?.stack ?? '');

          // Fallback: resolve userId from user_tokens by email so session-backed routes don't 401
          if (!token.userId && token.email) {
            try {
              const supabase = createServerClient();
              const { data } = await supabase
                .from('user_tokens')
                .select('user_id')
                .eq('email', token.email as string)
                .limit(1)
                .maybeSingle();
              if (data?.user_id) {
                token.userId = data.user_id;
                console.log('[auth][jwt] FALLBACK userId from user_tokens:', data.user_id);
              }
            } catch (fallbackErr: any) {
              console.error('[auth][jwt] FALLBACK also failed:', fallbackErr?.message);
            }
          }

          return await setOnboardingClaim(token);
        }
      },
      async session({ session, token }) {
        // Use the resolved Supabase UUID stored during sign-in.
        session.user.id = typeof token.userId === 'string' ? token.userId : '';
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        (session.user as typeof session.user & { hasOnboarded?: boolean }).hasOnboarded =
          Boolean((token as JWT & { hasOnboarded?: boolean }).hasOnboarded);
        if (!session.user.id) {
          console.error(`[auth][session] WARNING: token has no userId — email: ${token.email}, provider: ${token.provider}. User must sign out and sign back in to get a valid JWT.`);
        }
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
      signIn: '/login',
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
