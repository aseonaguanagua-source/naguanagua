import { supabase } from '@/lib/supabase';
import { getIdentidadVariants } from '@/lib/formatters';

/**
 * Regla ÚNICA de solvencia (Contribuyentes, Certificados, reimpresión).
 *  - Se ignoran inmuebles "Eliminado" (igual que Caja).
 *  - Si se pide un inmueble específico, solo cuenta ESE inmueble (y sus unidades
 *    si es condominio). Otro inmueble del mismo RIF con deuda no lo bloquea.
 *  - 'general' = todos los inmuebles no eliminados del RIF + facturas pendientes.
 */
export const inmuebleTieneDeuda = (i: any) =>
  i?.estado !== 'Eliminado' && (
    parseInt(String(i?.meses_deuda || 0), 10) > 0 ||
    parseFloat(String(i?.deuda_mmv || 0)) > 0.0001 ||
    parseFloat(String(i?.deuda_congelada_bs || 0)) > 0.01 ||
    parseFloat(String(i?.multa_bs || 0)) > 0.01
  );

export interface ResultadoSolvencia {
  solvente: boolean;
  mensaje: string;
  inmueblesConDeuda: string[];
}

export async function evaluarSolvencia(identidad: string, inmuebleSpec: string = 'general'): Promise<ResultadoSolvencia> {
  const variantes = getIdentidadVariants((identidad || '').trim());
  const especifico = inmuebleSpec && inmuebleSpec !== 'general' ? inmuebleSpec.trim() : '';

  const { data: inmsRif, error } = await supabase
    .from('inmuebles')
    .select('id, inmueble, estado, meses_deuda, deuda_mmv, deuda_congelada_bs, multa_bs, condominio_padre_id, padre_id')
    .in('identidad', variantes);
  if (error) return { solvente: false, mensaje: 'No se pudo verificar la deuda: ' + error.message, inmueblesConDeuda: [] };

  let alcance = inmsRif || [];
  if (especifico) {
    const principal = alcance.find((i: any) => i.inmueble === especifico);
    const { data: hijos } = await supabase
      .from('inmuebles')
      .select('id, inmueble, estado, meses_deuda, deuda_mmv, deuda_congelada_bs, multa_bs, condominio_padre_id, padre_id')
      .or(`condominio_padre_id.in.(${[especifico, principal?.id].filter(Boolean).join(',')}),padre_id.in.(${[especifico, principal?.id].filter(Boolean).join(',')})`);
    alcance = [...(principal ? [principal] : []), ...(hijos || [])];
    if (!principal) return { solvente: false, mensaje: `El inmueble ${especifico} no pertenece a ${identidad}.`, inmueblesConDeuda: [] };
    if (principal.estado === 'Eliminado') return { solvente: false, mensaje: `El inmueble ${especifico} está ELIMINADO. Reactívelo antes de emitir la solvencia.`, inmueblesConDeuda: [] };
  }

  const conDeuda = alcance.filter(inmuebleTieneDeuda);
  const detalle = conDeuda.map((i: any) => `${i.inmueble} (${i.meses_deuda || 0} meses)`);

  if (!especifico && !alcance.some((i: any) => i.estado !== 'Eliminado')) {
    return { solvente: false, mensaje: `${identidad} no tiene inmuebles activos (todos están eliminados). Reactive el inmueble antes de emitir la solvencia.`, inmueblesConDeuda: [] };
  }

  if (!especifico) {
    const idSin = (identidad || '').replace(/-/g, '');
    const { data: facts } = await supabase
      .from('facturas')
      .select('id')
      .or(`identidad.eq.${identidad},identidad.eq.${idSin}`)
      .in('estado', ['Pendiente', 'Abonado', 'Por Verificar']);
    if (facts && facts.length > 0) detalle.push(`${facts.length} factura(s) pendiente(s)`);
  }

  if (detalle.length > 0) {
    return {
      solvente: false,
      inmueblesConDeuda: conDeuda.map((i: any) => i.inmueble),
      mensaje: `EMISIÓN DENEGADA: ${especifico || identidad} tiene deuda pendiente en: ${detalle.join(', ')}.`,
    };
  }
  return { solvente: true, mensaje: 'Solvente', inmueblesConDeuda: [] };
}
