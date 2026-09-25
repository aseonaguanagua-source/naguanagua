import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // 1. Dominio exclusivo contribuyentes (aseonaguanagua.globalrecca.com)
  if (hostname.includes('aseonaguanagua.globalrecca.com')) {
    // Bloquear acceso a /admin o /operador
    if (pathname.startsWith('/admin') || pathname.startsWith('/operador')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
  }

  // 2. Dominio exclusivo administrativo (aseonaguanaguaad.globalrecca.com)
  if (hostname.includes('aseonaguanaguaad.globalrecca.com')) {
    // Bloquear acceso a /portal
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos).*)'],
};
