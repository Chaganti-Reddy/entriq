/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@entriq/shared'],

  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    // Extract just the origin from the API URL for CSP
    const apiOrigin = (() => {
      try { return new URL(apiUrl).origin; } catch { return apiUrl; }
    })();

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: self + Next.js inline scripts (nonce not set up, so unsafe-inline needed for Next.js)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Styles: self + inline (Tailwind purges so no external CDN needed)
              "style-src 'self' 'unsafe-inline'",
              // Images: self + quickchart.io for QR codes + data URIs
              `img-src 'self' data: https://quickchart.io`,
              // Fonts: self
              "font-src 'self'",
              // API calls
              `connect-src 'self' ${apiOrigin} https://countriesnow.space https://nominatim.openstreetmap.org`,
              // No frames, objects, or base URI changes
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'quickchart.io' },
    ],
  },
};

export default nextConfig;
