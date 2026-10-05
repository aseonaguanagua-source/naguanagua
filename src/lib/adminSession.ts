/**
 * adminSession.ts — Utilidades de sesión de servidor (solo server-side)
 * 
 * Implementa JWT almacenado en cookie httpOnly para la autenticación de
 * administradores. La cookie NO es accesible desde JavaScript del cliente,
 * lo que elimina el vector de ataque XSS presente en el sistema basado en
 * localStorage anterior.
 *
 * DISEÑO:
 * - Login  → POST /api/admin/login   → valida BD, hashea bcrypt, emite JWT en cookie
 * - Logout → POST /api/admin/logout  → borra la cookie
 * - Session→ GET  /api/admin/session → verifica JWT, retorna datos de sesión
 * - Middleware                       → verifica cookie en cada request a /admin
 */

import jwt from 'jsonwebtoken';

export const SESSION_COOKIE = 'admin_session';
export const SESSION_DURATION = 60 * 60 * 8; // 8 horas en segundos

/**
 * Obtiene el JWT_SECRET. Usa SUPABASE_SERVICE_ROLE_KEY como fallback
 * porque ya es una clave privada de servidor.
 * 
 * IMPORTANTE: Este módulo es server-only — nunca importar desde client components.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_PRIVATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('[adminSession] JWT_PRIVATE_SECRET no está configurado en variables de entorno.');
  return secret;
}

export interface AdminSession {
  usuario: string;
  nombre: string;
  rol: string;
  letra?: string;
  permisos?: Record<string, boolean>;
  iat?: number;
  exp?: number;
}

/** Firma y devuelve el JWT para la cookie de sesión */
export function signSession(payload: Omit<AdminSession, 'iat' | 'exp'>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_DURATION });
}

/** Verifica el JWT. Retorna el payload o null si es inválido/expirado */
export function verifySession(token: string): AdminSession | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AdminSession;
  } catch {
    return null;
  }
}

/**
 * Construye las opciones de la cookie httpOnly para Set-Cookie.
 * sameSite=Lax protege de CSRF sin romper navegación normal.
 */
export function buildCookieOptions(maxAge: number = SESSION_DURATION): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=VALUE; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
