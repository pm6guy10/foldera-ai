import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';

export function getAuthOptions(): NextAuthOptions {
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
            scope: 'openid profile email User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite offline_access',
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
            console.log(`[auth] jwt callback — provider: ${account.provider}, has_access_token: ${!!account.access_token}, has_refresh_token: ${!!account.refresh_token}`);
            token.accessToken = account.access_token;
            token.refreshToken = account.refresh_token;
            token.expiresAt = account.expires_at;
            token.email = user.email;
            token.name = user.name;
            token.provider = account.provider;

            // Single-user app: always resolve to INGEST_USER_ID (a valid Supabase UUID).
            // Fallback to token.sub (Google's numeric sub) only if not configured.
            // This prevents the "invalid input syntax for type uuid" error when session.user.id
            // is passed to Postgres — Google subs are not UUIDs.
            const resolvedUserId = process.env.INGEST_USER_ID ?? token.sub ?? (user as any).id;
            token.userId = resolvedUserId;
            console.log(`[auth] resolved userId: ${resolvedUserId}`);

            // Persist OAuth tokens to the `integrations` table so background
            // cron jobs (sync-email, etc.) can retrieve them without a session.
            try {
              const { saveTokens } = await import('@/lib/auth/token-store');
              if (resolvedUserId && account.access_token && account.refresh_token) {
                if (account.provider === 'google') {
                  await saveTokens(resolvedUserId, 'google', {
                    access_token: account.access_token,
                    refresh_token: account.refresh_token,
                    // expires_at from NextAuth is in seconds; GoogleTokens.expiry_date is ms
                    expiry_date: account.expires_at
                      ? account.expires_at * 1000
                      : Date.now() + 3_600_000,
                  });
                  // Also persist to user_tokens for background sync jobs
                  try {
                    const { saveUserToken } = await import('@/lib/auth/user-tokens');
                    await saveUserToken(resolvedUserId, 'google', {
                      access_token: account.access_token,
                      refresh_token: account.refresh_token,
                      expires_at: account.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                      email: user.email ?? undefined,
                      scopes: (account as any).scope ?? '',
                    });
                  } catch (utErr) {
                    console.error('[auth] Failed to persist to user_tokens:', utErr);
                  }
                } else if (account.provider === 'azure-ad') {
                  await saveTokens(resolvedUserId, 'azure_ad', {
                    access_token: account.access_token,
                    refresh_token: account.refresh_token,
                    expires_at: account.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
                  });
                }
                console.log(`[auth] Tokens persisted for ${account.provider}`);
              } else {
                console.warn(`[auth] Skipped token persist — missing: userId=${!!resolvedUserId} access=${!!account.access_token} refresh=${!!account.refresh_token}`);
              }
            } catch (err) {
              // Non-fatal — JWT still works; log and move on
              console.error('[auth] Failed to persist OAuth tokens:', err);
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
        // Use the resolved Supabase UUID (stored in token.userId during sign-in).
        // Falls back to token.sub for any edge case where userId was not stored.
        session.user.id = (token.userId as string | undefined) ?? token.sub!;
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
      maxAge: 30 * 24 * 60 * 60,
    },
    secret: process.env.NEXTAUTH_SECRET,
  };
}

export const authOptions = getAuthOptions();
