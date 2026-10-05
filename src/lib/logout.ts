import { logAudit } from './audit';

/**
 * Cierre de sesión seguro y definitivo para funcionarios / administradores.
 * 1. Registra bitácora de auditoría inmutable
 * 2. Elimina todas las credenciales de localStorage y sessionStorage
 * 3. Llama al endpoint /api/admin/logout para expirar la cookie httpOnly
 * 4. Redirige a la ruta indicada (por defecto /admin) forzando recarga completa de credenciales
 */
export async function performLogout(redirectTo: string = '/admin'): Promise<void> {
  try {
    const usuarioActual = localStorage.getItem('adminUser') || 'Funcionario';
    await logAudit(`Cierre de Sesión Seguro: ${usuarioActual}`, { usuario: usuarioActual }, 'SESION', 'BAJA').catch(() => {});

    // Eliminar absolutamente todas las claves de sesión municipal
    const keysToRemove = [
      'admin_auth_andministrador',
      'admin_user_data',
      'adminUser',
      'adminLetra',
      'adminToken',
      'operador_censo_auth',
      'operador_user_data',
      'auth_token',
      'user_role'
    ];
    keysToRemove.forEach(k => {
      localStorage.removeItem(k);
    });

    sessionStorage.clear();

    // Eliminar cookie del servidor
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
  } catch (err) {
    console.error('Error al procesar logout:', err);
  } finally {
    // Redirigir asegurando que la pantalla de bloqueo o inicio pida credenciales desde cero
    window.location.href = redirectTo;
  }
}
