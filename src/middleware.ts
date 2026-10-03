import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — Permite navegación fluida entre todos los módulos del sistema.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos).*)'],
};
