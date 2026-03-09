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
    callbacks: {
      async jwt({ token, account, user }) {
        if (account && user) {
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
          token.expiresAt = account.expires_at;
          token.email = user.email;
          token.name = user.name;
          token.provider = account.provider;
        }
        return token;
      },
      async session({ session, token }) {
        session.user.id = token.sub!;
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
    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60,
    },
    secret: process.env.NEXTAUTH_SECRET,
  };
}

export const authOptions = getAuthOptions();

