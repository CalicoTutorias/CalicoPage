import * as Sentry from '@sentry/nextjs';

// Runtime del navegador. El DSN es público (NEXT_PUBLIC_*); sin él el SDK no envía nada.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
});

// Instrumenta las navegaciones del App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
