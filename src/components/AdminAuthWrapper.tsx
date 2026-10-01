'use client';
import React, { useCallback } from 'react';
import { logAudit } from '@/lib/audit';

/**
 * AdminAuthWrapper — acceso directo sin login requerido.
 * El guard de autenticación fue desactivado por configuración del administrador.
 */
export default function AdminAuthWrapper({ children }: { children: React.ReactNode }) {
  // Logout: limpia cache local y redirige al inicio
  const handleLogout = useCallback(async (reason = 'Manual') => {
    logAudit(`Logout (${reason})`, {}, 'SESION');
    if (typeof window !== 'undefined') {
      ['admin_auth_andministrador', 'admin_user_data', 'adminUser', 'adminLetra', 'adminToken'].forEach(k =>
        localStorage.removeItem(k)
      );
    }
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    window.location.href = '/admin';
  }, []);

  // Acceso directo — siempre autenticado
  return <>{children}</>;
}
