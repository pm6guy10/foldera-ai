/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/integrations/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 's-maxage=60, stale-while-revalidate=300',
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

export default nextConfig;