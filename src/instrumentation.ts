import * as Sentry from '@sentry/nextjs';

// Next.js llama a register() una vez por runtime al arrancar el server.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captura errores de Server Components, route handlers y middleware.
export const onRequestError = Sentry.captureRequestError;
