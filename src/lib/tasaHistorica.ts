/** UCD (Unidad de Cuenta Dinámica) = tasa oficial Euro BCV × 57 (misma base de la tarifa: F.O. × 57 × Tasa × FAC/FAR). */
export const FACTOR_UCD = 57;
export const valorUCD = (tasaEuro: number) => (Number(tasaEuro) || 0) * FACTOR_UCD;

/** Tasa oficial BCV del Euro vigente en una fecha (AAAA-MM-DD). Usada por Caja y Caja de Condominios. */
export async function obtenerTasaEuroFecha(fecha: string): Promise<{ euro: number; fechaValor: string }> {
  const res = await fetch(`/api/bcv/historico?fecha=${encodeURIComponent(fecha)}`, { cache: 'no-store' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.success || !(Number(j.euro) > 0)) throw new Error(j?.error || 'No se pudo obtener la tasa de esa fecha');
  return { euro: Number(j.euro), fechaValor: String(j.fecha_valor) };
}

export const fechaDMY = (iso: string) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};
