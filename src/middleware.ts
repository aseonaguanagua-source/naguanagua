import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware — Edge Runtime Compatible
 *
 * DISEÑO INTENCIONADO (defense in depth):
 * - El middleware verifica SOLO la presencia de la cookie (Edge-safe, sin crypto).
 * - La verificación de la firma JWT se hace en el cliente vía /api/admin/session
 *   (Node.js runtime, puede usar jsonwebtoken).
 * - Un token forjado con cookie falsa pasaría el middleware pero sería rechazado
 *   por AdminAuthWrapper antes de cargar cualquier dato sensible.
 *
 * Esto es correcto: el middleware protege contra acceso anónimo (el caso común).
 * AdminAuthWrapper protege contra tokens forjados (el caso avanzado).
 */

const SESSION_COOKIE = 'admin_session';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // ── 1. Separación de dominios (UX layer) ──────────────────────────────────
  if (hostname.includes('aseonaguanagua.globalrecca.com')) {
    if (pathname.startsWith('/admin') || pathname.startsWith('/operador')) {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
  }

  if (hostname.includes('aseonaguanaguaad.globalrecca.com')) {
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // ── 2. Protección de rutas /admin/* (Fix M-1) ─────────────────────────────
  // Solo verificar presencia de cookie — Edge runtime no soporta jsonwebtoken.
  // La verificación de firma ocurre en AdminAuthWrapper via /api/admin/session.
  const isAdminRoute = pathname.startsWith('/admin');
  // Excluir la página de login para evitar redirect loop
  const isLoginPage = pathname === '/admin' || pathname === '/admin/';

  if (isAdminRoute && !isLoginPage) {
    const hasSessionCookie = request.cookies.has(SESSION_COOKIE);
    if (!hasSessionCookie) {
      const loginUrl = new URL('/admin', request.url);
      loginUrl.searchParams.set('returnUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos).*)'],
};
