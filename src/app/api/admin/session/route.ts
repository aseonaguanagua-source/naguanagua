/**
 * GET /api/admin/session
 * Verifica la cookie httpOnly y retorna los datos de sesión.
 * Usado por AdminAuthWrapper para rehidratar la sesión en cada load.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/adminSession';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = verifySession(token);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    usuario: session.usuario,
    nombre: session.nombre,
    rol: session.rol,
    letra: session.letra || '',
    permisos: session.permisos || {},
  });
}
