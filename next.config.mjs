import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Prevent Next.js from trying to bundle server-only markdown/parsing deps
    // into vendor chunks (fixes esprima vendor chunk missing error in dev)
    serverComponentsExternalPackages: [
      'gray-matter', 'remark', 'remark-gfm', 'remark-html',
      'unified', 'vfile', 'esprima', 'js-yaml',
    ],
  },
  async headers() {
    return [
      // Session-scoped JSON (e.g. GET /api/integrations/status) — never cache on shared caches;
      // s-maxage caused stale connector state after OAuth reconnect on production.
      {
        source: '/api/integrations/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/api/calendar/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 's-maxage=120, stale-while-revalidate=600',
          },
        ],
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  silent: true,
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
