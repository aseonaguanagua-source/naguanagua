import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { getIdentidadVariantsExact } from '@/lib/formatters';
import { cargarCondominio, calcularEstado, tasaVigente } from '@/lib/condominios/servicio';
import { inmuebleTieneDeuda } from '@/lib/solvencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const COLS = 'id, inmueble, identidad, estado, meses_deuda, deuda_mmv, deuda_congelada_bs, multa_bs, condominio_padre_id, padre_id, actividad_principal, cant_inmuebles, es_condominio';
const esNA = (i: any) => String(i?.actividad_principal || '').trim().toUpperCase() === 'N/A';

/**
 * Regla N/A: un contenedor N/A con actividades adentro no tiene deuda propia (su deuda es la de sus actividades).
 * Se evalúan sus actividades, no el contenedor.
 */
const sinContenedoresNA = (lista: any[], todos: any[]) =>
  lista.filter(i => !(esNA(i) && todos.some(c => c.inmueble !== i.inmueble && (c.padre_id === i.inmueble || c.condominio_padre_id === i.inmueble) && c.estado !== 'Eliminado')));

/** ¿Los condominios ya se cobran solo en su módulo? */
async function condominiosSeparados() {
  const { data } = await sb.from('sistema_config').select('valor').eq('id', 'condominios_separados').maybeSingle();
  return String(data?.valor ?? '').toLowerCase() === 'true';
}

/**
 * Deuda de un condominio o de una unidad según el MÓDULO DE CONDOMINIOS (el que se cobra en la Caja de Condominios).
 * Condominio: lo que paga el condominio (aseo + IVA; en los centralizados también sus multas).
 * Unidad: su propia deuda y la de sus actividades.
 */
async function deudaModulo(codigo: string): Promise<{ enModulo: boolean; deudaBs: number; detalle: string[] }> {
  const { data: condo } = await sb.from('condominios').select('codigo').eq('codigo', codigo).neq('estado', 'Eliminado').maybeSingle();
  let codCondo = condo?.codigo as string | undefined;
  let unidadId: string | null = null;
  if (!codCondo) {
    const { data: u } = await sb.from('condominio_unidades').select('id, condominio_id').eq('inmueble', codigo).neq('estado', 'Eliminada').limit(1).maybeSingle();
    if (!u) return { enModulo: false, deudaBs: 0, detalle: [] };
    const { data: c } = await sb.from('condominios').select('codigo').eq('id', u.condominio_id).neq('estado', 'Eliminado').maybeSingle();
    if (!c) return { enModulo: false, deudaBs: 0, detalle: [] };
    codCondo = c.codigo; unidadId = u.id;
  }
  const datos = await cargarCondominio(codCondo!);
  if (!datos) return { enModulo: false, deudaBs: 0, detalle: [] };
  const estado = calcularEstado(datos.condo, datos.unidades, await tasaVigente(), new Date(), datos.multas);
  let renglones = estado.renglones;
  if (unidadId) {
    const hijos = new Set(datos.unidades.filter((u: any) => u.padre_unidad_id === unidadId || String(u.padre_inmueble || '').toUpperCase() === codigo).map((u: any) => u.id));
    renglones = renglones.filter(r => r.clave === unidadId || hijos.has(r.clave));
    const deuda = renglones.reduce((a, r) => a + r.totalBs, 0);
    return { enModulo: true, deudaBs: deuda, detalle: renglones.filter(r => r.totalBs > 0.01).map(r => `${r.inmueble || codigo} (${r.deuda.meses} meses${r.deuda.multaBs + r.multaExtraBs > 0 ? ' + multas' : ''})`) };
  }
  // Condominio completo: si las multas las paga cada unidad, no bloquean la solvencia del condominio
  const deudaCondo = (r: any) => estado.porActividad ? r.deuda.baseBs + r.deuda.ivaBs - r.deuda.retencionBs : r.totalBs;
  const conDeuda = renglones.filter(r => deudaCondo(r) > 0.01);
  return { enModulo: true, deudaBs: conDeuda.reduce((a, r) => a + deudaCondo(r), 0), detalle: conDeuda.length ? [`${codigo} (${conDeuda.length} unidad(es) con aseo pendiente, hasta ${Math.max(...conDeuda.map(r => r.deuda.meses))} meses)`] : [] };
}

/**
 * POST /api/solvencia { identidad, inmueble? }
 * Regla única de solvencia (Contribuyentes, Certificados, reimpresión), en el servidor (sin timeouts de la llave pública).
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const identidad = String(b.identidad || '').trim().toUpperCase();
    const especifico = b.inmueble && b.inmueble !== 'general' ? String(b.inmueble).trim().toUpperCase() : '';
    const variantes = getIdentidadVariantsExact(identidad);
    const separados = await condominiosSeparados();

    const { data: inmsRif, error } = await sb.from('inmuebles').select(COLS).in('identidad', variantes.length ? variantes : [identidad]);
    if (error) return NextResponse.json({ solvente: false, mensaje: 'No se pudo verificar la deuda: ' + error.message, inmueblesConDeuda: [] });

    if (especifico) {
      let principal: any = (inmsRif || []).find((i: any) => String(i.inmueble).toUpperCase() === especifico);
      if (!principal) {
        const { data: pDb } = await sb.from('inmuebles').select(COLS).eq('inmueble', especifico).maybeSingle();
        principal = pDb;
      }
      if (!principal) {
        // Puede ser un condominio que existe en el módulo de condominios
        const m = await deudaModulo(especifico);
        if (m.enModulo) return NextResponse.json(m.deudaBs > 0.01
          ? { solvente: false, inmueblesConDeuda: [especifico], mensaje: `EMISIÓN DENEGADA: ${especifico} tiene deuda pendiente en: ${m.detalle.join(', ')}.` }
          : { solvente: true, mensaje: 'Solvente', inmueblesConDeuda: [] });
        return NextResponse.json({ solvente: false, mensaje: `El inmueble ${especifico} no fue encontrado.`, inmueblesConDeuda: [] });
      }
      if (principal.estado === 'Eliminado') return NextResponse.json({ solvente: false, mensaje: `El inmueble ${especifico} está ELIMINADO. Reactívelo antes de emitir la solvencia.`, inmueblesConDeuda: [] });

      // Condominios y sus unidades: la deuda oficial que vale es la del módulo de condominios
      const m = await deudaModulo(especifico);
      if (m.enModulo) return NextResponse.json(m.deudaBs > 0.01
        ? { solvente: false, inmueblesConDeuda: [especifico], mensaje: `EMISIÓN DENEGADA: ${especifico} tiene deuda pendiente en: ${m.detalle.join(', ')}.` }
        : { solvente: true, mensaje: 'Solvente', inmueblesConDeuda: [] });

      // Actividades del inmueble (dos consultas simples en vez de un OR pesado que daba timeout)
      const [h1, h2] = await Promise.all([
        sb.from('inmuebles').select(COLS).eq('padre_id', especifico).neq('estado', 'Eliminado'),
        sb.from('inmuebles').select(COLS).eq('condominio_padre_id', especifico).neq('estado', 'Eliminado').limit(2000),
      ]);
      const hijos = [...(h1.data || []), ...(h2.data || [])].filter((h, i, arr) => arr.findIndex(x => x.id === h.id) === i);
      const alcance = [principal, ...hijos];
      const conDeuda = sinContenedoresNA(alcance, alcance).filter(inmuebleTieneDeuda);
      if (conDeuda.length) {
        return NextResponse.json({ solvente: false, inmueblesConDeuda: conDeuda.map((i: any) => i.inmueble),
          mensaje: `EMISIÓN DENEGADA: ${especifico} tiene deuda pendiente en: ${conDeuda.map((i: any) => `${i.inmueble} (${i.meses_deuda || 0} meses)`).join(', ')}.` });
      }
      return NextResponse.json({ solvente: true, mensaje: 'Solvente', inmueblesConDeuda: [] });
    }

    // GENERAL: todos los inmuebles no eliminados del RIF + facturas pendientes
    const vivos = (inmsRif || []).filter((i: any) => i.estado !== 'Eliminado');
    if (!vivos.length) return NextResponse.json({ solvente: false, mensaje: `${identidad} no tiene inmuebles activos (todos están eliminados). Reactive el inmueble antes de emitir la solvencia.`, inmueblesConDeuda: [] });
    const detalle: string[] = [];
    const conDeuda: string[] = [];
    for (const i of sinContenedoresNA(vivos, vivos)) {
      const m = await deudaModulo(String(i.inmueble).toUpperCase());
      if (m.enModulo) { if (m.deudaBs > 0.01) { conDeuda.push(i.inmueble); detalle.push(...m.detalle); } continue; }
      if (inmuebleTieneDeuda(i)) { conDeuda.push(i.inmueble); detalle.push(`${i.inmueble} (${i.meses_deuda || 0} meses)`); }
    }
    const idList = variantes.length ? variantes : [identidad];
    const { data: facts } = await sb.from('facturas').select('id').in('identidad', idList).in('estado', ['Pendiente', 'Abonado', 'Por Verificar']);
    if (facts && facts.length > 0) {
      if (conDeuda.length === 0) {
        // Si los inmuebles están solventes (0 meses de deuda), conciliar facturas viejas
        try {
          await sb.from('facturas')
            .update({ estado: 'Pagado', metodo_pago: 'Conciliado por Solvencia', fecha_pago: new Date().toISOString() })
            .in('identidad', idList)
            .in('estado', ['Pendiente', 'Abonado', 'Por Verificar']);
        } catch (_) {}
      } else {
        detalle.push(`${facts.length} factura(s) pendiente(s)`);
      }
    }
    if (detalle.length) return NextResponse.json({ solvente: false, inmueblesConDeuda: conDeuda, mensaje: `EMISIÓN DENEGADA: ${identidad} tiene deuda pendiente en: ${detalle.join(', ')}.` });
    return NextResponse.json({ solvente: true, mensaje: 'Solvente', inmueblesConDeuda: [] });
  } catch (e: any) {
    return NextResponse.json({ solvente: false, mensaje: 'No se pudo verificar la deuda: ' + (e?.message || 'Error'), inmueblesConDeuda: [] }, { status: 200 });
  }
}
