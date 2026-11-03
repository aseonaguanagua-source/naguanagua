import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — Permite navegación fluida entre todos los módulos del sistema.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Redirigir rutas heredadas del sistema anterior (SIGYR) hacia el nuevo portal
  if (
    pathname === '/auth/login' ||
    pathname === '/user/login' ||
    pathname === '/contribuyente' ||
    pathname === '/contribuyentes/login'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/portal/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos).*)'],
};
