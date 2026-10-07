/**
 * Modificar un pago desde el navegador pasando por el servidor (/api/admin/pagos/actualizar).
 * El navegador NO tiene permiso de modificar `pagos_reportados` directamente (fallaba en silencio).
 * Lanza un Error si no se pudo guardar.
 */
export async function actualizarPago(
  pagoId: string,
  cambios: { estado?: string; banco?: string; tipo?: string; detalles?: any; created_at?: string },
  opciones: { soloSiEstado?: string } = {},
): Promise<void> {
  const ls = typeof window !== 'undefined' ? window.localStorage : null;
  const usuario = ls?.getItem('adminUser') || '';
  const r = await fetch('/api/admin/pagos/actualizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pagoId, cambios, usuario, soloSiEstado: opciones.soloSiEstado }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo guardar el pago.');
}
