/** UCD (Unidad de Cuenta Dinámica) = tasa oficial Euro BCV (a 2 decimales) × 57 (misma base de la tarifa: F.O. × 57 × Tasa × FAC/FAR). */
export const FACTOR_UCD = 57;
export const valorUCD = (tasaEuro: number) => {
  const tasaR2 = Math.round(((Number(tasaEuro) || 0) + Number.EPSILON) * 100) / 100;
  return Math.round((tasaR2 * FACTOR_UCD + Number.EPSILON) * 100) / 100;
};

/** Tasa oficial BCV del Euro vigente en una fecha (AAAA-MM-DD), redondeada a 2 decimales. Usada por Caja y Caja de Condominios. */
export async function obtenerTasaEuroFecha(fecha: string): Promise<{ euro: number; fechaValor: string }> {
  const res = await fetch(`/api/bcv/historico?fecha=${encodeURIComponent(fecha)}`, { cache: 'no-store' });
  const j = await res.json().catch(() => ({}));
  const valRaw = Number(j?.euro_redondeado || j?.euro || j?.euro_exacto || 0);
  const valR2 = Math.round((valRaw + Number.EPSILON) * 100) / 100;
  if (!res.ok || !j?.success || !(valR2 > 0)) throw new Error(j?.error || 'No se pudo obtener la tasa de esa fecha');
  return { euro: valR2, fechaValor: String(j.fecha_valor) };
}

export const fechaDMY = (iso: string) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};
