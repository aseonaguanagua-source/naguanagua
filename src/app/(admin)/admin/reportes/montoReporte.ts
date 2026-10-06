/**
 * Monto de REPORTE: si el administrador corrigió el monto de un pago para los reportes (error del cajero),
 * todos los reportes y PDFs usan ese monto. El pago real queda en `monto_real` y no se modifica.
 */
export function aplicarMontoReporte(p: any) {
  let det: any = p?.detalles || {};
  if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }
  if (det?.monto_reporte == null) return p;
  const m = parseFloat(det.monto_reporte) || 0;
  return { ...p, monto: m, monto_real: p.monto, monto_corregido: true, detalles: { ...det, ...(det.monto_conciliado != null ? { monto_conciliado: m } : {}) } };
}
