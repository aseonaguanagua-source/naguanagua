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
  const { data: condo } = await sb.from('condominios').select('codigo').eq('codigo', codigo).neq('estado', 'Eliminado').limit(1).maybeSingle();
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
 * Verifica si un Agente de Retención tiene pagos/facturas con retención de IVA (75%) cuyo comprobante
 * NO ha sido aprobado por Hacienda Municipal Y TAMPOCO ha sido habilitado/liberado desde el menú de Liberación sin Planilla.
 * Además indica si la solvencia fue explícitamente emitida/autorizada desde el módulo de Liberación sin Planilla.
 */
async function verificarEstadoLiberacionSolvencia(
  idVariants: string[],
  codigosAlcance: string[]
): Promise<{ bloqueado: boolean; facturaRef?: string; autorizadaDesdeLiberacion: boolean }> {
  try {
    if (!idVariants.length) return { bloqueado: false, autorizadaDesdeLiberacion: false };
    const [{ data: pagos }, { data: retsIva }] = await Promise.all([
      sb
        .from('pagos_reportados')
        .select('id, identidad, referencia, tipo, estado, detalles')
        .in('identidad', idVariants)
        .eq('estado', 'Aprobado')
        .order('created_at', { ascending: false })
        .limit(100),
      sb
        .from('retenciones_iva')
        .select('id, estado, factura_control, codigo_retencion')
        .in('identidad', idVariants)
        .eq('estado', 'Aprobado'),
    ]);

    if (!pagos || pagos.length === 0) return { bloqueado: false, autorizadaDesdeLiberacion: false };

    const aprobIds = new Set<string>();
    const aprobControles = new Set<string>();
    const aprobDocs = new Set<string>();
    (retsIva || []).forEach((r: any) => {
      if (r.id) aprobIds.add(String(r.id));
      if (r.factura_control) aprobControles.add(String(r.factura_control).trim());
      if (r.codigo_retencion) {
        const cleanDoc = String(r.codigo_retencion).replace(/^FAC-/i, '').trim();
        if (cleanDoc) aprobDocs.add(cleanDoc);
      }
    });

    const alcanceUpper = new Set(codigosAlcance.map(c => String(c || '').trim().toUpperCase()).filter(Boolean));
    let autorizadaDesdeLiberacion = false;
    let bloqueado = false;
    let facturaRef: string | undefined;

    for (const p of pagos) {
      const refUpper = String(p.referencia || '').trim().toUpperCase();
      const tipoUpper = String(p.tipo || '').trim().toUpperCase();
      if (refUpper.startsWith('RET-') || refUpper.startsWith('RECH-') || tipoUpper.includes('RETENCION') || tipoUpper.includes('RETENCIÓN')) {
        continue;
      }
      let det: any = {};
      try {
        det = typeof p.detalles === 'string' ? JSON.parse(p.detalles) : (p.detalles || {});
      } catch {}
      if (det?.pago_vinculado || det?.es_comprobante_retencion) continue;
      if (det?.anulado || det?.factura_digital?.anulada || det?.factura_anulada) continue;

      // Si se consulta un inmueble específico, filtrar pagos que correspondan a otro inmueble distinto del mismo RIF
      if (alcanceUpper.size > 0) {
        const pagoCodes = new Set<string>();
        [det.codigo_inmueble, det.cod_inmueble, det.inmueble].forEach((raw: any) => {
          if (!raw) return;
          String(raw)
            .split(/[,;\s|/]+/)
            .map(s => s.trim().toUpperCase())
            .filter(s => /^(URB|AURI)\d+/i.test(s))
            .forEach(s => pagoCodes.add(s));
        });
        if (Array.isArray(det.recibos)) {
          det.recibos.forEach((r: any) => {
            const m = String(r || '').match(/((?:URB|AURI)\d+)/i);
            if (m && m[1]) pagoCodes.add(m[1].toUpperCase());
          });
        }
        if (pagoCodes.size > 0 && !Array.from(pagoCodes).some(c => alcanceUpper.has(c))) {
          continue;
        }
      }

      if (det.solvencia_emitida_liberacion === true) {
        autorizadaDesdeLiberacion = true;
        continue;
      }

      const fd = det.factura_digital || {};
      const r = fd.retencion || {};
      const montoRet = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || r.retenido || 0)) || 0;
      const tieneRetencion = Boolean(
        montoRet > 0 ||
        det.es_retencion === true ||
        det.conRetencion === true ||
        det.agente_retencion === true ||
        r.estado
      );
      if (!tieneRetencion) continue;
      // Solo exige planilla si la factura fue emitida o se descontó retención al pagar
      if (!fd.emitida && montoRet <= 0) continue;

      // ¿Tiene planilla de retención aprobada por la vía regular (reglas de siempre)?
      const numDoc = String(fd.numero_documento || '').trim();
      const numCtrl = String(fd.numero_control || '').trim();
      const tienePlanillaEnTablaAprobada = Boolean(
        (r.retencion_id && aprobIds.has(String(r.retencion_id))) ||
        (numCtrl && aprobControles.has(numCtrl)) ||
        (numDoc && aprobDocs.has(numDoc))
      );
      const aprobadaRegular =
        tienePlanillaEnTablaAprobada ||
        det.liberado_sin_planilla === true ||
        det.exonerado_planilla_retencion === true ||
        r.liberado_sin_planilla === true ||
        r.exonerado_planilla_retencion === true ||
        det.retencion_aprobada === true ||
        r.estado === 'aprobada';
      if (aprobadaRegular) continue;

      if (!bloqueado) {
        bloqueado = true;
        facturaRef = numDoc ? `Factura N° ${numDoc}` : (p.referencia || 'Pago con Retención');
      }
    }

    return { bloqueado, facturaRef, autorizadaDesdeLiberacion };
  } catch (e) {
    console.warn('[solvencia] Error verificando retenciones:', e);
    return { bloqueado: false, autorizadaDesdeLiberacion: false };
  }
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
        const { data: pDb } = await sb.from('inmuebles').select(COLS).eq('inmueble', especifico).limit(1).maybeSingle();
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
      const esContenedorCondominioNA = (i: any) =>
        esNA(i) && alcance.some(c => c.inmueble !== i.inmueble && (c.padre_id === i.inmueble || c.condominio_padre_id === i.inmueble) && c.estado !== 'Eliminado');
      const conDeuda = sinContenedoresNA(alcance, alcance).filter(inmuebleTieneDeuda);
      
      // Regla N/A y general: si el principal tiene deuda (y no es contenedor N/A) o sus actividades tienen deuda, NO es solvente
      if (!esContenedorCondominioNA(principal) && inmuebleTieneDeuda(principal) && !conDeuda.some((x: any) => x.inmueble === principal.inmueble)) {
        conDeuda.push(principal);
      }

      if (conDeuda.length) {
        return NextResponse.json({ solvente: false, inmueblesConDeuda: conDeuda.map((i: any) => i.inmueble),
          mensaje: `EMISIÓN DENEGADA: ${especifico} tiene deuda pendiente en: ${conDeuda.map((i: any) => `${i.inmueble} (${i.meses_deuda || 0} meses)`).join(', ')}.` });
      }

      // Validar facturas pendientes del inmueble y sus actividades agrupadas
      const codigosAlcance = alcance.map((i: any) => i.inmueble).filter(Boolean);
      const { data: factsInm } = await sb
        .from('facturas')
        .select('id, referencia, estado')
        .in('identidad', variantes.length ? variantes : [identidad])
        .in('estado', ['Pendiente', 'Abonado', 'Por Verificar']);

      const facturasPendientesInm = (factsInm || []).filter((f: any) =>
        codigosAlcance.some((c: string) => (f.referencia || '').includes(c))
      );

      if (facturasPendientesInm.length > 0) {
        return NextResponse.json({
          solvente: false,
          inmueblesConDeuda: [especifico],
          mensaje: `EMISIÓN DENEGADA: ${especifico} registra ${facturasPendientesInm.length} recibo(s) pendiente(s) o en verificación.`
        });
      }

      const blqInm = await verificarEstadoLiberacionSolvencia(variantes.length ? variantes : [identidad], codigosAlcance);
      if (blqInm.bloqueado) {
        return NextResponse.json({
          solvente: false,
          bloqueadoRetencion: true,
          inmueblesConDeuda: [especifico],
          mensaje: `EMISIÓN DENEGADA: ${especifico} registra ${blqInm.facturaRef || 'pagos'} con Retención de IVA (75%) sin planilla consignada o aprobada. Debe cargar su comprobante en la sección Retención o ser habilitado en Liberación sin Planilla.`
        });
      }

      return NextResponse.json({ solvente: true, bloqueadoRetencion: false, mensaje: 'Solvente', inmueblesConDeuda: [] });
    }

    // GENERAL: todos los inmuebles no eliminados del RIF + facturas pendientes
    const vivos = (inmsRif || []).filter((i: any) => i.estado !== 'Eliminado');
    if (!vivos.length) return NextResponse.json({ solvente: false, mensaje: `${identidad} no tiene inmuebles activos (todos están eliminados). Reactive el inmueble antes de emitir la solvencia.`, inmueblesConDeuda: [] });
    const idList = variantes.length ? variantes : [identidad];

    const detalle: string[] = [];
    const conDeuda: string[] = [];
    for (const i of sinContenedoresNA(vivos, vivos)) {
      const m = await deudaModulo(String(i.inmueble).toUpperCase());
      if (m.enModulo) { if (m.deudaBs > 0.01) { conDeuda.push(i.inmueble); detalle.push(...m.detalle); } continue; }
      if (inmuebleTieneDeuda(i)) { conDeuda.push(i.inmueble); detalle.push(`${i.inmueble} (${i.meses_deuda || 0} meses)`); }
    }
    const { data: facts } = await sb.from('facturas').select('id, estado').in('identidad', idList).in('estado', ['Pendiente', 'Abonado', 'Por Verificar']);
    if (facts && facts.length > 0) {
      const porVerificar = facts.filter((f: any) => f.estado === 'Por Verificar');
      if (porVerificar.length > 0) {
        detalle.push(`${porVerificar.length} pago(s) en espera de verificación bancaria`);
      } else {
        detalle.push(`${facts.length} factura(s) pendiente(s)`);
      }
    }

    if (detalle.length) return NextResponse.json({ solvente: false, inmueblesConDeuda: conDeuda, bloqueadoRetencion: false, mensaje: `EMISIÓN DENEGADA: ${identidad} tiene obligaciones pendientes en: ${detalle.join(', ')}.` });

    const blqGen = await verificarEstadoLiberacionSolvencia(idList, vivos.map((i: any) => i.inmueble).filter(Boolean));
    if (blqGen.bloqueado) {
      return NextResponse.json({
        solvente: false,
        bloqueadoRetencion: true,
        inmueblesConDeuda: conDeuda,
        mensaje: `EMISIÓN DENEGADA: ${identidad} registra ${blqGen.facturaRef || 'pagos'} con Retención de IVA (75%) sin planilla consignada o aprobada. Debe cargar su comprobante en la sección Retención o ser habilitado en Liberación sin Planilla.`
      });
    }

    return NextResponse.json({ solvente: true, bloqueadoRetencion: false, mensaje: 'Solvente', inmueblesConDeuda: [] });
  } catch (e: any) {
    return NextResponse.json({ solvente: false, mensaje: 'No se pudo verificar la deuda: ' + (e?.message || 'Error'), inmueblesConDeuda: [] }, { status: 200 });
  }
}
