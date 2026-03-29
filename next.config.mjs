/** @type {import('next').NextConfig} */
const nextConfig = {
  // Expose public env vars to the client bundle (same names as in .env — no NEXT_PUBLIC_ prefix).
  env: {
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY ?? '',
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN ?? '',
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? '',
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET ?? '',
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '',
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID ?? '',
    FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID ?? '',
    API_URL: process.env.API_URL ?? '',
    WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY ?? '',
  },
};

export default nextConfig;
