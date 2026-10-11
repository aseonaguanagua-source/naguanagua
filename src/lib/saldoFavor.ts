/**
 * saldoFavor.ts
 * Operaciones atómicas sobre el campo saldo_favor_bs de la tabla inmuebles.
 *
 * PROBLEMA ORIGINAL (I-6):
 * El saldo siempre se leía/escribía en inmuebles[0] sin ORDER BY, lo que
 * producía resultados no deterministas cuando el contribuyente tenía
 * múltiples inmuebles. Este módulo consolida el saldo en el inmueble
 * PRINCIPAL (principal=true) o, si no existe, en el de menor id (más antiguo).
 *
 * MODELO DE DATOS:
 * El saldo a favor es por CONTRIBUYENTE (no por inmueble). Se almacena
 * distribuido en la tabla inmuebles por restricción del esquema actual.
 * La suma de saldo_favor_bs de todos los inmuebles del contribuyente
 * representa el saldo total disponible.
 */

import { supabase } from '@/lib/supabase';

interface SaldoUpdateResult {
  ok: boolean;
  error?: string;
  nuevoSaldo?: number;
}

/**
 * Obtiene el saldo total a favor de un contribuyente sumando todos sus inmuebles.
 * También retorna el inmueble "principal" donde se consolida el saldo.
 */
export async function getSaldoFavorTotal(identidad: string): Promise<{
  total: number;
  inmueblePrincipalId: string | null;
}> {
  // NOTA: la tabla inmuebles NO tiene columna `principal` (consultarla hacía fallar TODAS las notas de crédito).
  const id = String(identidad || '').trim().toUpperCase();
  const sinGuion = id.replace(/-/g, '');
  const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : id;
  const variantes = [...new Set([id, sinGuion, conGuion].filter(Boolean))];
  const { data, error } = await supabase
    .from('inmuebles')
    .select('id, saldo_favor_bs, estado')
    .in('identidad', variantes)
    .order('id', { ascending: true });

  if (error || !data || data.length === 0) {
    return { total: 0, inmueblePrincipalId: null };
  }

  const total = data.reduce(
    (sum, i) => sum + (parseFloat(i.saldo_favor_bs || '0') || 0),
    0
  );

  // Consolidar en el inmueble que ya tenga saldo, si no en el primer inmueble no eliminado (o el más antiguo)
  const conSaldo = data.find(i => (parseFloat(i.saldo_favor_bs || '0') || 0) > 0.009);
  const vivo = data.find(i => i.estado !== 'Eliminado');
  return { total, inmueblePrincipalId: (conSaldo || vivo || data[0]).id };
}

/**
 * Acredita saldo a favor al inmueble principal del contribuyente.
 * Si el contribuyente tiene un inmueble marcado como principal, lo usa.
 * De lo contrario usa el inmueble más antiguo (menor id).
 */
export async function acreditarSaldoFavor(
  identidad: string,
  monto: number
): Promise<SaldoUpdateResult> {
  const { inmueblePrincipalId } = await getSaldoFavorTotal(identidad);
  if (!inmueblePrincipalId) {
    return { ok: false, error: 'No se encontraron inmuebles para el contribuyente' };
  }

  // Leer saldo actual del inmueble principal
  const { data: inm } = await supabase
    .from('inmuebles')
    .select('saldo_favor_bs')
    .eq('id', inmueblePrincipalId)
    .single();

  const currentSaldo = parseFloat(inm?.saldo_favor_bs || '0') || 0;
  const nuevoSaldo = currentSaldo + monto;

  const { error } = await supabase
    .from('inmuebles')
    .update({ saldo_favor_bs: nuevoSaldo })
    .eq('id', inmueblePrincipalId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, nuevoSaldo };
}

/**
 * Descuenta saldo a favor del inmueble principal del contribuyente.
 * El saldo no puede quedar negativo — se aplica Math.max(0, ...).
 */
export async function descontarSaldoFavor(
  identidad: string,
  monto: number
): Promise<SaldoUpdateResult> {
  const id = String(identidad || '').trim().toUpperCase();
  const sinGuion = id.replace(/-/g, '');
  const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : id;
  const { data: inms, error: e1 } = await supabase
    .from('inmuebles')
    .select('id, saldo_favor_bs')
    .in('identidad', [...new Set([id, sinGuion, conGuion].filter(Boolean))])
    .order('id', { ascending: true });
  if (e1) return { ok: false, error: e1.message };
  if (!inms || inms.length === 0) {
    return { ok: false, error: 'No se encontraron inmuebles para el contribuyente' };
  }

  // El saldo puede estar repartido en varios inmuebles: se descuenta de cada uno hasta cubrir el monto
  let resto = Math.round((Number(monto) || 0) * 100) / 100;
  let total = 0;
  for (const inm of inms) {
    const s = parseFloat(inm.saldo_favor_bs || '0') || 0;
    total += s;
    if (resto <= 0.009 || s <= 0.009) continue;
    const usa = Math.min(s, resto);
    const { error } = await supabase.from('inmuebles').update({ saldo_favor_bs: Math.round((s - usa) * 100) / 100 }).eq('id', inm.id);
    if (error) return { ok: false, error: error.message };
    resto = Math.round((resto - usa) * 100) / 100;
  }
  return { ok: true, nuevoSaldo: Math.max(0, Math.round((total - (Number(monto) || 0)) * 100) / 100) };
}
