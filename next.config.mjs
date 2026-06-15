import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    // Dev-only: avoid webpack filesystem pack cache (*.pack.gz) ENOENT on Windows.
    if (dev) {
      config.cache = { type: 'memory' };
    }
    return config;
  },
  experimental: {
    // Prevent Next.js from trying to bundle server-only markdown/parsing deps
    // into vendor chunks (fixes esprima vendor chunk missing error in dev)
    serverComponentsExternalPackages: [
      'gray-matter', 'remark', 'remark-gfm', 'remark-html',
      'unified', 'vfile', 'esprima', 'js-yaml',
    ],
    outputFileTracingIncludes: {
      '/api/slack/command': ['ACTIVE_HANDOFF.md', 'ACTIVE_SEAM_STATE.json', 'FOLDERA_BUILD_ORDER.yaml'],
    },
  },
  async redirects() {
    return [
      {
        source: '/try',
        destination: '/start',
        permanent: false,
      },
      {
        source: '/try/:path*',
        destination: '/start',
        permanent: false,
      },
      {
        source: '/signup',
        destination: '/start',
        permanent: false,
      },
      {
        source: '/signup/:path*',
        destination: '/start',
        permanent: false,
      },
      {
        source: '/request-access',
        destination: '/start',
        permanent: false,
      },
      {
        source: '/request-access/:path*',
        destination: '/start',
        permanent: false,
      },
      {
        source: '/api/try/analyze',
        destination: '/status',
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      // Public HTML: allow CDN/browser storage but require revalidation so “stale tab” sessions
      // pick up new document shells after deploy (asset URLs still content-hashed by Next).
      {
        source: '/',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/pricing',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/try/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
      // Session-scoped JSON (e.g. GET /api/integrations/status) stays private to the browser.
      // Short browser TTLs cut repeated reads, while OAuth reconnect flows now force reload on the
      // freshness-sensitive client refreshes instead of relying on shared-cache no-store.
      {
        source: '/api/integrations/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, max-age=20, stale-while-revalidate=40',
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
