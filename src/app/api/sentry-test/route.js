import * as Sentry from '@sentry/nextjs';

export async function GET() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const isDsnConfigured = Boolean(dsn);

  if (!isDsnConfigured) {
    return Response.json({
      success: false,
      status: 'error',
      message: 'NEXT_PUBLIC_SENTRY_DSN no está configurada en las variables de entorno.',
      dsnConfigured: false,
    }, { status: 500 });
  }

  // Capturamos un evento de prueba en Sentry
  let eventId = null;
  Sentry.withScope((scope) => {
    scope.setTag('service', 'test');
    scope.setTag('issue_type', 'sentry_connectivity_test');
    scope.setLevel('info');
    scope.setContext('test_info', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    });
    eventId = Sentry.captureMessage('🧪 Prueba de conectividad exitosa desde Calico Backend');
  });

  return Response.json({
    success: true,
    status: 'connected',
    message: 'Evento de prueba enviado a Sentry exitosamente.',
    eventId,
    environment: process.env.NODE_ENV,
    dsnConfigured: true,
  });
}
