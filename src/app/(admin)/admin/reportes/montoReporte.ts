function parseMontoNumero(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).trim();
  if (s.includes(',') && s.includes('.')) {
    return Number(s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) || 0;
  }
  if (s.includes(',')) return Number(s.replace(',', '.')) || 0;
  return Number(s) || 0;
}

/**
 * Monto de REPORTE: si el administrador corrigió el monto de un pago para los reportes (error del cajero),
 * todos los reportes y PDFs usan ese monto. El pago real queda en `monto_real` y no se modifica.
 */
export function aplicarMontoReporte(p: any) {
  let det: any = p?.detalles || {};
  if (typeof det === 'string') { try { det = JSON.parse(det); } catch { det = {}; } }
  if (det?.monto_reporte == null) return p;
  const m = parseMontoNumero(det.monto_reporte);
  return { ...p, monto: m, monto_real: p.monto, monto_corregido: true, detalles: { ...det, ...(det.monto_conciliado != null ? { monto_conciliado: m } : {}) } };
}
