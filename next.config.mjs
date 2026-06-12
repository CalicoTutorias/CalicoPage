import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Baseline security headers applied to every response. Intentionally does NOT
// include a strict Content-Security-Policy: enforcing CSP on a Next.js app that
// also loads the Wompi widget + Google OAuth needs a dedicated test pass (inline
// hydration scripts, styled-jsx, third-party origins) and is tracked separately.
// X-Frame-Options already blocks the main clickjacking vector here.
const securityHeaders = [
  // Force HTTPS for 2 years incl. subdomains. Browsers ignore this on localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Stop MIME-type sniffing (defends against content-type confusion attacks).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Disallow the site being framed by other origins → clickjacking protection.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Don't leak full URLs (incl. tokens in query strings) to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Drop powerful features the app never uses in its own origin.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/tutor/courses',
        destination: '/tutor/materias',
        permanent: false,
      },
    ];
  },
  serverExternalPackages: ['@prisma/client', '@prisma/engines', 'bcrypt'],
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;
