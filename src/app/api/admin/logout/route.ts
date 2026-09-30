/**
 * POST /api/admin/logout
 * Borra la cookie de sesión httpOnly.
 */
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/adminSession';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Expirar la cookie inmediatamente
  response.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  return response;
}
