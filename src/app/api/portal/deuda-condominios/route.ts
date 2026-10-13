import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { prepararCobro } from '@/lib/condominios/cobro';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/portal/deuda-condominios?identidad=J-12345678-9
 * SOLO LECTURA. Deuda del contribuyente en condominios (unidades del módulo de Condominios a su RIF),
 * calculada con el mismo motor de la Caja de Condominios (modo CONTRIBUYENTE).
 * En Soy Contribuyente se MUESTRA pero NO se puede pagar (se paga por Caja de Condominios).
 */
export async function GET(req: Request) {
  try {
    const idn = String(new URL(req.url).searchParams.get('identidad') || '').trim().toUpperCase();
    if (idn.length < 5) return NextResponse.json({ condominios: [] });
    const variants = /^[VEJPG][-_\s]?\d+$/i.test(idn) ? getIdentidadVariantsExact(idn) : getIdentidadVariants(idn);
    const orF = variants.map(v => `identidad.eq.${v}`).join(',');

    const { data: unidades } = await sb.from('condominio_unidades').select('condominio_id, estado').or(orF);
    const ids = [...new Set((unidades || []).filter((u: any) => u.estado !== 'Eliminada').map((u: any) => u.condominio_id).filter(Boolean))];
    if (!ids.length) return NextResponse.json({ condominios: [] });
    const { data: condos } = await sb.from('condominios').select('id, codigo, nombre').in('id', ids);

    const out: any[] = [];
    for (const c of condos || []) {
      try {
        const { _datos, ...cobro } = await prepararCobro({ codigo: c.codigo, modo: 'CONTRIBUYENTE', identidad: idn });
        void _datos;
        const lineas = (cobro.lineas || []).filter(l => l.totalBs > 0 || l.mesesDeuda > 0).map(l => ({
          inmueble: l.inmueble, numero: l.numero, actividad: l.actividad, meses: l.mesesDeuda,
          periodos: l.periodos, baseBs: l.baseBs, multaBs: l.multaBs + l.multasAparteBs, ivaBs: l.ivaBs,
          retencionBs: l.retencionBs, totalBs: l.totalBs,
        }));
        if (lineas.length) out.push({ codigo: c.codigo, nombre: c.nombre, lineas, totalBs: cobro.totales?.totalBs || 0 });
      } catch { /* condominio sin datos: se omite */ }
    }
    return NextResponse.json({ condominios: out }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ condominios: [], error: e?.message }, { status: 200 });
  }
}
