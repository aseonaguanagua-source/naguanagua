import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { cargarCondominio, calcularEstado, tasaVigente } from '@/lib/condominios/servicio';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/condominios/deuda-unidad?inmueble=URB014990[&tasa=980.61]
 * Deuda de una unidad (y de las actividades que cuelgan de ella) EXACTAMENTE como la calcula el módulo de
 * condominios. La usan el Simulador y la Solvencia para que den el mismo monto que la ficha del condominio.
 * Responde { enCondominio: false } si el inmueble no es unidad de ningún condominio.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const inmueble = String(url.searchParams.get('inmueble') || '').trim().toUpperCase();
    if (!inmueble) return NextResponse.json({ error: 'Falta el inmueble' }, { status: 400 });

    // ¿Es un condominio?
    const { data: condoDirecto } = await sb.from('condominios').select('codigo').eq('codigo', inmueble).maybeSingle();
    let codigoCondo = condoDirecto?.codigo as string | undefined;
    let unidadId: string | null = null;
    if (!codigoCondo) {
      const { data: u } = await sb.from('condominio_unidades').select('id, condominio_id, estado').eq('inmueble', inmueble).neq('estado', 'Eliminada').limit(1).maybeSingle();
      if (!u) return NextResponse.json({ enCondominio: false });
      const { data: c } = await sb.from('condominios').select('codigo').eq('id', u.condominio_id).maybeSingle();
      if (!c) return NextResponse.json({ enCondominio: false });
      codigoCondo = c.codigo; unidadId = u.id;
    }
    const datos = await cargarCondominio(codigoCondo!);
    if (!datos) return NextResponse.json({ enCondominio: false });
    const tasaQ = parseFloat(String(url.searchParams.get('tasa') || '')) || 0;
    const tasa = tasaQ > 0 ? tasaQ : await tasaVigente();
    const estado = calcularEstado(datos.condo, datos.unidades, tasa, new Date(), datos.multas);

    let renglones = estado.renglones;
    if (unidadId) {
      // La unidad + sus actividades (por padre_unidad_id o por inmuebles.padre_id)
      const hijos = new Set<string>(datos.unidades.filter((u: any) => u.padre_unidad_id === unidadId || String(u.padre_inmueble || '').toUpperCase() === inmueble).map((u: any) => u.id));
      renglones = estado.renglones.filter(r => r.clave === unidadId || hijos.has(r.clave));
    }
    const porActividad = estado.porActividad;
    const out = renglones.map(r => ({
      clave: r.clave, inmueble: r.inmueble, numero: r.numero, actividad: r.actividad, residencial: r.residencial, esGrupo: r.esGrupo,
      mensualBs: r.mensualBs, meses: r.deuda.meses, baseBs: r.deuda.baseBs, ivaBs: r.deuda.ivaBs, retencionBs: r.deuda.retencionBs,
      multaBs: Math.round((r.deuda.multaBs + r.multaExtraBs + r.multasManualesBs) * 100) / 100, totalBs: r.totalBs,
    }));
    const s = (k: 'baseBs' | 'ivaBs' | 'multaBs' | 'totalBs' | 'retencionBs' | 'mensualBs') => Math.round(out.reduce((a, x) => a + (Number(x[k]) || 0), 0) * 100) / 100;
    return NextResponse.json({
      enCondominio: true, esCondominio: !unidadId, condominio: { codigo: datos.condo.codigo, nombre: datos.condo.nombre, modalidad: datos.condo.modalidad, tipo: datos.condo.tipo },
      porActividad, tasa, renglones: out,
      totales: { mensualBs: s('mensualBs'), baseBs: s('baseBs'), ivaBs: s('ivaBs'), multaBs: s('multaBs'), retencionBs: s('retencionBs'), totalBs: s('totalBs'), mesesMax: Math.max(0, ...out.map(x => x.meses)) },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  }
}
