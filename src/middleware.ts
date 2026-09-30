import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/adminSession';

/**
 * Middleware — Fix M-1 (hostname spoofing → JWT cookie real)
 *
 * ANTES: Solo verificaba el header 'host' para redirigir entre dominios.
 *        No había ninguna validación de sesión real.
 *        Un atacante podía manipular el header 'host' o acceder directamente.
 *
 * AHORA:
 * 1. Rutas /admin/*: requieren cookie httpOnly válida con JWT firmado.
 *    Sin cookie válida → redirect al login.
 * 2. Separación de dominios: sigue funcionando para redirigir contribuyentes
 *    vs. administradores según el hostname (capa de UX, no de seguridad).
 * 3. Las API routes públicas (/api/bcv, /api/contribuyente/*) no requieren cookie.
 * 4. /api/admin/* protegidas individualmente por cada route handler.
 */
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // ── 1. Separación de dominios (UX layer) ────────────────────────────────────
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

  // ── 2. Protección de rutas /admin/* con cookie JWT (Fix M-1) ────────────────
  // No proteger el login mismo (evitar redirect loop)
  const isAdminRoute = pathname.startsWith('/admin');
  const isLoginPage = pathname === '/admin' || pathname === '/admin/';

  if (isAdminRoute && !isLoginPage) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;

    if (!token) {
      // Sin cookie → redirect al login con returnUrl
      const loginUrl = new URL('/admin', request.url);
      loginUrl.searchParams.set('returnUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Verificar JWT sin importar la clave (Edge runtime compatible)
    // La verificación completa ocurre en /api/admin/session
    // Aquí verificamos solo que el token existe y está bien formado
    const session = verifySession(token);
    if (!session) {
      const loginUrl = new URL('/admin', request.url);
      loginUrl.searchParams.set('expired', '1');
      const response = NextResponse.redirect(loginUrl);
      // Limpiar cookie inválida
      response.headers.set(
        'Set-Cookie',
        `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
      );
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Proteger rutas admin y de portal, excluir assets estáticos y API
    '/((?!api|_next/static|_next/image|favicon.ico|logos).*)',
  ],
};
