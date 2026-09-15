import { NextResponse } from 'next/server';

export function middleware(request) {
  if (process.env.MAINTENANCE_MODE !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === '/maintenance') {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/maintenance';
  return NextResponse.redirect(url);
}

export const config = {
  // `api` y `monitoring` (túnel de Sentry) quedan fuera: el modo mantenimiento
  // solo redirige páginas, y cada request de API pagaba una invocación de
  // middleware extra solo para evaluar la variable de entorno.
  matcher: [
    '/((?!api|monitoring|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.webp$|.*\\.ico$).*)',
  ],
};
