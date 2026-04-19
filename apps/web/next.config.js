/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const scriptSrc = isProduction
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";
    const connectSrc = isProduction
      ? "connect-src 'self' ws: wss: https:"
      : "connect-src 'self' ws: wss: https: http://localhost:3000 http://localhost:4000";

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; ${connectSrc}; img-src 'self' data: https:`
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
