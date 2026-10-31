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
export async function getSaldoFavorTotal(identidad: string, codigoInmueble?: string, dbClient?: any): Promise<{
  total: number;
  inmueblePrincipalId: string | null;
}> {
  const client = dbClient || supabase;
  const id = String(identidad || '').trim().toUpperCase();
  const sinGuion = id.replace(/-/g, '');
  const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : id;
  const variantes = [...new Set([id, sinGuion, conGuion].filter(Boolean))];

  let query = client.from('inmuebles').select('id, saldo_favor_bs, estado, inmueble');
  if (codigoInmueble) {
    query = query.or(`identidad.in.(${variantes.join(',')}),inmueble.eq.${codigoInmueble.toUpperCase()}`);
  } else if (/^(URB|AURI|[A-Z]{3,})\d+/i.test(id)) {
    query = query.or(`inmueble.eq.${id},identidad.in.(${variantes.join(',')})`);
  } else {
    query = query.in('identidad', variantes);
  }

  const { data, error } = await query.order('id', { ascending: true });

  if (error || !data || data.length === 0) {
    return { total: 0, inmueblePrincipalId: null };
  }

  const total = data.reduce(
    (sum: number, i: any) => sum + (parseFloat(i.saldo_favor_bs || '0') || 0),
    0
  );

  // Si se especificó un código de inmueble específico, ese inmueble es prioritario
  const targetInm = codigoInmueble ? data.find((i: any) => String(i.inmueble || '').toUpperCase() === codigoInmueble.toUpperCase()) : null;
  const conSaldo = data.find((i: any) => (parseFloat(i.saldo_favor_bs || '0') || 0) > 0.009);
  const vivo = data.find((i: any) => i.estado !== 'Eliminado');
  return { total, inmueblePrincipalId: (targetInm || conSaldo || vivo || data[0]).id };
}

/**
 * Acredita saldo a favor al inmueble principal del contribuyente y/o condominio.
 */
async function resolveCondo(identidad?: string, codigoCondominio?: string, client?: any): Promise<{ id: string; codigo: string; abono_bs: number } | null> {
  const sb = client || supabase;
  if (codigoCondominio) {
    const { data } = await sb.from('condominios').select('id, codigo, abono_bs').eq('codigo', String(codigoCondominio).trim().toUpperCase()).maybeSingle();
    if (data) return { id: data.id, codigo: data.codigo, abono_bs: parseFloat(data.abono_bs || '0') || 0 };
  }
  if (!identidad) return null;
  const idTrim = String(identidad).trim().toUpperCase();
  if (/^(URB|AURI|[A-Z]{3,})\d+/i.test(idTrim)) {
    const { data } = await sb.from('condominios').select('id, codigo, abono_bs').eq('codigo', idTrim).maybeSingle();
    if (data) return { id: data.id, codigo: data.codigo, abono_bs: parseFloat(data.abono_bs || '0') || 0 };
  }
  const sinGuion = idTrim.replace(/[^A-Z0-9]/g, '');
  const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : idTrim;
  const variantes = [...new Set([idTrim, sinGuion, conGuion].filter(Boolean))];
  const { data } = await sb.from('condominios').select('id, codigo, abono_bs').in('identidad', variantes).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (data) return { id: data.id, codigo: data.codigo, abono_bs: parseFloat(data.abono_bs || '0') || 0 };
  return null;
}

/**
 * Acredita saldo a favor al inmueble principal del contribuyente y/o condominio.
 */
export async function acreditarSaldoFavor(
  identidad: string,
  monto: number,
  codigoCondominio?: string,
  dbClient?: any
): Promise<SaldoUpdateResult> {
  const client = dbClient || supabase;
  const montoNum = Math.round((Number(monto) || 0) * 100) / 100;
  if (montoNum <= 0) return { ok: true, nuevoSaldo: 0 };

  const { inmueblePrincipalId } = await getSaldoFavorTotal(identidad, codigoCondominio, client);
  
  // Si es un condominio y tiene registro en tabla condominios, actualizar abono_bs
  const condoRow = await resolveCondo(identidad, codigoCondominio, client);
  if (condoRow) {
    const nuevoAbono = Math.round((condoRow.abono_bs + montoNum) * 100) / 100;
    await client.from('condominios').update({ abono_bs: nuevoAbono }).eq('id', condoRow.id);
  }

  if (!inmueblePrincipalId) {
    if (condoRow || codigoCondominio) return { ok: true, nuevoSaldo: montoNum };
    return { ok: false, error: 'No se encontraron inmuebles para el contribuyente' };
  }

  // Leer saldo actual del inmueble principal
  const { data: inm } = await client
    .from('inmuebles')
    .select('saldo_favor_bs')
    .eq('id', inmueblePrincipalId)
    .single();

  const currentSaldo = parseFloat(inm?.saldo_favor_bs || '0') || 0;
  const nuevoSaldo = Math.round((currentSaldo + montoNum) * 100) / 100;

  const { error } = await client
    .from('inmuebles')
    .update({ saldo_favor_bs: nuevoSaldo })
    .eq('id', inmueblePrincipalId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, nuevoSaldo };
}

/**
 * Descuenta saldo a favor del inmueble principal del contribuyente o condominio.
 * El saldo no puede quedar negativo — se aplica Math.max(0, ...).
 */
export async function descontarSaldoFavor(
  identidad: string,
  monto: number,
  codigoCondominio?: string,
  dbClient?: any
): Promise<SaldoUpdateResult> {
  const client = dbClient || supabase;
  const montoNum = Math.round((Number(monto) || 0) * 100) / 100;
  if (montoNum <= 0) return { ok: true, nuevoSaldo: 0 };

  // 1. Si es condominio, descontar de tabla condominios
  const condoRow = await resolveCondo(identidad, codigoCondominio, client);
  let condoActualizado = false;
  if (condoRow) {
    const nuevoAbono = Math.max(0, Math.round((condoRow.abono_bs - montoNum) * 100) / 100);
    await client.from('condominios').update({ abono_bs: nuevoAbono }).eq('id', condoRow.id);
    condoActualizado = true;
  }

  // 2. Descontar también de inmuebles para mantener la sincronía exacta
  let pendiente = montoNum;

  const id = String(identidad || '').trim().toUpperCase();
  const sinGuion = id.replace(/-/g, '');
  const conGuion = /^[VEJPG]\d/.test(sinGuion) ? `${sinGuion[0]}-${sinGuion.slice(1)}` : id;
  const variantes = [...new Set([id, sinGuion, conGuion].filter(Boolean))];

  let q = client.from('inmuebles').select('id, saldo_favor_bs');
  if (codigoCondominio) {
    q = q.or(`identidad.in.(${variantes.join(',')}),inmueble.eq.${codigoCondominio.toUpperCase()}`);
  } else if (/^(URB|AURI|[A-Z]{3,})\d+/i.test(id)) {
    q = q.or(`inmueble.eq.${id},identidad.in.(${variantes.join(',')})`);
  } else {
    q = q.in('identidad', variantes);
  }

  const { data: inms, error: e1 } = await q.order('id', { ascending: true });
  if (e1) return { ok: false, error: e1.message };
  if (!inms || inms.length === 0) {
    if (condoActualizado || condoRow) return { ok: true, nuevoSaldo: 0 };
    return { ok: false, error: 'No se encontraron inmuebles para el contribuyente' };
  }

  // El saldo puede estar repartido en varios inmuebles: se descuenta de cada uno hasta cubrir el monto
  let total = 0;
  for (const inm of inms) {
    const s = parseFloat(inm.saldo_favor_bs || '0') || 0;
    total += s;
    if (pendiente <= 0.009 || s <= 0.009) continue;
    const usa = Math.min(s, pendiente);
    const { error } = await client.from('inmuebles').update({ saldo_favor_bs: Math.round((s - usa) * 100) / 100 }).eq('id', inm.id);
    if (error) return { ok: false, error: error.message };
    pendiente = Math.round((pendiente - usa) * 100) / 100;
  }
  return { ok: true, nuevoSaldo: Math.max(0, Math.round((total - (Number(monto) || 0)) * 100) / 100) };
}
