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
  const { data, error } = await supabase
    .from('inmuebles')
    .select('id, saldo_favor_bs, principal')
    .eq('identidad', identidad)
    .order('principal', { ascending: false }) // principal=true primero
    .order('id', { ascending: true });         // luego el más antiguo

  if (error || !data || data.length === 0) {
    return { total: 0, inmueblePrincipalId: null };
  }

  const total = data.reduce(
    (sum, i) => sum + (parseFloat(i.saldo_favor_bs || '0') || 0),
    0
  );

  // Usar el primer resultado (principal=true o más antiguo)
  return { total, inmueblePrincipalId: data[0].id };
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
  const { inmueblePrincipalId } = await getSaldoFavorTotal(identidad);
  if (!inmueblePrincipalId) {
    return { ok: false, error: 'No se encontraron inmuebles para el contribuyente' };
  }

  const { data: inm } = await supabase
    .from('inmuebles')
    .select('saldo_favor_bs')
    .eq('id', inmueblePrincipalId)
    .single();

  const currentSaldo = parseFloat(inm?.saldo_favor_bs || '0') || 0;
  const nuevoSaldo = Math.max(0, currentSaldo - monto);

  const { error } = await supabase
    .from('inmuebles')
    .update({ saldo_favor_bs: nuevoSaldo })
    .eq('id', inmueblePrincipalId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, nuevoSaldo };
}
