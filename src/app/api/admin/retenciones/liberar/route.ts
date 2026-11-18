import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { enviarFacturaConCopiaInterna } from '@/lib/facturaMailer';
import { parseDet, correoContribuyente } from '@/lib/retencionFlujo';
import { extraerCodigoInmueble } from '@/lib/documentoPago';
import { getIdentidadVariantsExact, isFictitiousEmail } from '@/lib/formatters';
import { inmuebleTieneDeuda } from '@/lib/solvencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const normId = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function extraerCodigosDePago(det: any): string[] {
  const codes = new Set<string>();
  const add = (raw: any) => {
    if (!raw) return;
    String(raw)
      .split(/[,;\s|/]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => /^(URB|AURI)\d+/i.test(s))
      .forEach(s => codes.add(s));
  };
  add(det?.codigo_inmueble);
  add(det?.cod_inmueble);
  add(det?.inmueble);
  if (Array.isArray(det?.recibos)) {
    det.recibos.forEach((r: any) => {
      const c = extraerCodigoInmueble(String(r || ''));
      if (c) add(c);
    });
  }
  if (Array.isArray(det?.recibo_caja)) {
    det.recibo_caja.forEach((rc: any) => {
      add(rc?.codContribuyente);
      add(rc?.inmueble);
    });
  }
  return Array.from(codes);
}

/**
 * GET /api/admin/retenciones/liberar?q=...&filtro=todos|esperando_planilla|pendientes_emision|liberados
 * Lista los pagos/facturas de agentes o ex-agentes de retención (o cualquier contribuyente buscado por q)
 * para permitir liberar su emisión/entrega de factura y solvencia SIN exigir planilla de retención
 * y SIN modificar ningún monto, fecha ni registro del Libro de Ventas de cierres anteriores.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim();
    const filtro = (url.searchParams.get('filtro') || 'todos').trim().toLowerCase();

    // Si hay búsqueda específica por código URB/AURI, RIF o nombre, resolver identidades e inmuebles vinculados
    const queryIdents = new Set<string>();
    const queryCodes = new Set<string>();

    if (q.length >= 2) {
      const qUpper = q.toUpperCase();
      if (/^(URB|AURI)\d+/i.test(qUpper)) {
        queryCodes.add(qUpper);
      }
      const { data: inmsFound } = await supabase
        .from('inmuebles')
        .select('inmueble, identidad, contribuyente, padre_id, condominio_padre_id')
        .or(`inmueble.ilike.%${q}%,identidad.ilike.%${q}%,contribuyente.ilike.%${q}%`)
        .limit(150);

      (inmsFound || []).forEach((i: any) => {
        if (i.identidad) {
          queryIdents.add(String(i.identidad).trim().toUpperCase());
          getIdentidadVariantsExact(i.identidad).forEach(v => queryIdents.add(v.toUpperCase()));
        }
        if (i.inmueble) queryCodes.add(String(i.inmueble).trim().toUpperCase());
        if (i.padre_id) queryCodes.add(String(i.padre_id).trim().toUpperCase());
      });
    }

    // 1. Consultar pagos aprobados/conciliados recientes (y si hay búsqueda q, incluir los del contribuyente)
    let pagosRaw: any[] = [];
    const { data: recentPagos, error: errPagos } = await supabase
      .from('pagos_reportados')
      .select('id, identidad, monto, banco, referencia, tipo, estado, modulo, grupo_pago, created_at, detalles')
      .eq('estado', 'Aprobado')
      .order('created_at', { ascending: false })
      .limit(2500);

    if (errPagos) throw errPagos;
    pagosRaw = recentPagos || [];

    if (q.length >= 2 && queryIdents.size > 0) {
      const existingIds = new Set(pagosRaw.map((p: any) => p.id));
      const { data: extraPagos } = await supabase
        .from('pagos_reportados')
        .select('id, identidad, monto, banco, referencia, tipo, estado, modulo, grupo_pago, created_at, detalles')
        .in('identidad', Array.from(queryIdents).slice(0, 60))
        .eq('estado', 'Aprobado')
        .order('created_at', { ascending: false })
        .limit(300);
      (extraPagos || []).forEach((ep: any) => {
        if (!existingIds.has(ep.id)) {
          existingIds.add(ep.id);
          pagosRaw.push(ep);
        }
      });
    }

    // 2. Recopilar identidades y códigos para enriquecer con catálogo de inmuebles
    const allIdents = new Set<string>();
    const allCodes = new Set<string>();
    pagosRaw.forEach((p: any) => {
      if (p.identidad) allIdents.add(String(p.identidad).trim().toUpperCase());
      const det = parseDet(p.detalles);
      extraerCodigosDePago(det).forEach(c => allCodes.add(c));
    });

    const inmByCode = new Map<string, any>();
    const inmsByIdent = new Map<string, any[]>();

    if (allCodes.size > 0) {
      const codesArr = Array.from(allCodes);
      for (let i = 0; i < codesArr.length; i += 250) {
        const chunk = codesArr.slice(i, i + 250);
        const { data: inms } = await supabase
          .from('inmuebles')
          .select('id, inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, direccion, correo_electronico, telefono, agente_retencion, meses_deuda, deuda_mmv, deuda_congelada_bs, multa_bs, estado, padre_id, condominio_padre_id')
          .in('inmueble', chunk);
        (inms || []).forEach((row: any) => {
          const cod = String(row.inmueble || '').toUpperCase();
          if (cod) inmByCode.set(cod, row);
          const idKey = normId(row.identidad);
          if (idKey) {
            if (!inmsByIdent.has(idKey)) inmsByIdent.set(idKey, []);
            inmsByIdent.get(idKey)!.push(row);
          }
        });
      }
    }

    const identsArr = Array.from(allIdents);
    for (let i = 0; i < identsArr.length; i += 200) {
      const chunk = identsArr.slice(i, i + 200);
      const { data: inms } = await supabase
        .from('inmuebles')
        .select('id, inmueble, identidad, contribuyente, tipo, clasificacion, actividad_principal, direccion, correo_electronico, telefono, agente_retencion, meses_deuda, deuda_mmv, deuda_congelada_bs, multa_bs, estado, padre_id, condominio_padre_id')
        .in('identidad', chunk);
      (inms || []).forEach((row: any) => {
        const cod = String(row.inmueble || '').toUpperCase();
        if (cod && !inmByCode.has(cod)) inmByCode.set(cod, row);
        const idKey = normId(row.identidad);
        if (idKey) {
          const list = inmsByIdent.get(idKey) || [];
          if (!list.some((x: any) => x.id === row.id)) {
            list.push(row);
            inmsByIdent.set(idKey, list);
          }
        }
      });
    }

    // 3. Cargar retenciones_iva para saber cuáles tienen planilla aprobada formalmente
    const { data: retsIva } = await supabase
      .from('retenciones_iva')
      .select('id, identidad, numero_planilla, estado, factura_control, codigo_retencion, planilla_url')
      .limit(2000);
    const retById = new Map<string, any>();
    const retByControl = new Map<string, any>();
    (retsIva || []).forEach((r: any) => {
      if (r.id) retById.set(String(r.id), r);
      if (r.factura_control) retByControl.set(String(r.factura_control).trim(), r);
    });

    // Mes actual YYYY-MM en hora de Venezuela para identificar facturas de cierres pasados
    const hoyYMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
    const mesActualYM = hoyYMD.slice(0, 7);

    const items: any[] = [];

    for (const p of pagosRaw) {
      const refUpper = String(p.referencia || '').trim().toUpperCase();
      const tipoUpper = String(p.tipo || '').trim().toUpperCase();
      // Excluir filas auxiliares RET-... (comprobantes de retención vinculados) o pagos secundarios absorbidos
      if (refUpper.startsWith('RET-') || refUpper.startsWith('RECH-') || tipoUpper.includes('RETENCION') || tipoUpper.includes('RETENCIÓN')) {
        continue;
      }
      const det = parseDet(p.detalles);
      if (det?.pago_vinculado || det?.es_comprobante_retencion) continue;
      if (det?.es_pago_adicional === true && det?.pago_principal_id && det.pago_principal_id !== p.id) continue;
      if (det?.anulado || det?.factura_digital?.anulada || det?.factura_anulada) continue;

      const fd = det.factura_digital || {};
      const retObj = fd.retencion || {};
      const codigosPago = extraerCodigosDePago(det);
      const idKey = normId(p.identidad);
      const inmsContrib = (inmsByIdent.get(idKey) || []).filter((i: any) => i.estado !== 'Eliminado');
      const inmsDelPago = codigosPago.map(c => inmByCode.get(c)).filter(Boolean);
      const inmsRef = inmsDelPago.length > 0 ? inmsDelPago : inmsContrib;

      // Verificar si es comercial
      const esResidencial = inmsRef.length > 0 && inmsRef.every((i: any) => String(i.tipo || i.clasificacion || '').toUpperCase().includes('RESIDENCIAL'));
      if (esResidencial && !fd?.emitida && !det?.es_retencion && !det?.agente_retencion) continue;

      const montoRet = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || retObj.retenido || 0)) || 0;
      const esAgenteEnPadron = inmsRef.some((i: any) => i.agente_retencion === true);
      const tieneMarcaRetencion = Boolean(
        montoRet > 0 ||
        det.es_retencion ||
        det.conRetencion ||
        det.agente_retencion ||
        retObj.estado ||
        det.liberado_sin_planilla ||
        esAgenteEnPadron
      );

      // Si no hay búsqueda activa `q`, mostrar solo los casos que tienen marca de retención / ex-agente / liberado
      if (!q && !tieneMarcaRetencion) continue;

      const retRow =
        (retObj.retencion_id ? retById.get(String(retObj.retencion_id)) : null) ||
        (fd.numero_control ? retByControl.get(String(fd.numero_control).trim()) : null);

      const liberadoSinPlanilla = Boolean(
        det.liberado_sin_planilla === true ||
        det.exonerado_planilla_retencion === true ||
        fd?.retencion?.liberado_sin_planilla === true
      );

      let retencionEstado: 'esperando_planilla' | 'planilla_recibida' | 'aprobada' | 'rechazada' | 'liberada_sin_planilla' | 'sin_retencion' = 'sin_retencion';
      if (liberadoSinPlanilla) {
        retencionEstado = 'liberada_sin_planilla';
      } else if (tieneMarcaRetencion) {
        const stRaw = retObj.estado;
        if (stRaw === 'aprobada' || det.retencion_aprobada === true || retRow?.estado === 'Aprobado') {
          retencionEstado = 'aprobada';
        } else if (stRaw === 'planilla_recibida' || retRow?.estado === 'Pendiente') {
          retencionEstado = 'planilla_recibida';
        } else if (stRaw === 'rechazada' || retRow?.estado === 'Rechazado') {
          retencionEstado = 'rechazada';
        } else {
          retencionEstado = 'esperando_planilla';
        }
      }

      const facturaEmitida = Boolean(fd?.emitida && (fd?.numero_documento || fd?.numero_control || fd?.url));
      const fechaDocStr = String(
        det.fecha_emision_override ||
        (fd?.fecha_emision ? String(fd.fecha_emision).slice(0, 10) : '') ||
        det.fecha_transaccion ||
        (p.created_at ? String(p.created_at).slice(0, 10) : '')
      ).slice(0, 10);
      const esCierrePasado = Boolean(fechaDocStr && /^\d{4}-\d{2}/.test(fechaDocStr) && fechaDocStr.slice(0, 7) < mesActualYM);

      const nombreContrib =
        det.contribuyente ||
        det.contribuyente_nombre ||
        inmsRef[0]?.contribuyente ||
        det.recibo_caja?.[0]?.razonSocial ||
        p.identidad;

      const correoCand = [
        fd?.correo_utilizado,
        det.correo,
        inmsRef.find((i: any) => i.correo_electronico && !isFictitiousEmail(i.correo_electronico))?.correo_electronico,
      ]
        .map(c => String(c || '').trim())
        .find(c => c.includes('@') && !isFictitiousEmail(c)) || '';

      const codigosFinal = codigosPago.length > 0
        ? codigosPago
        : Array.from(new Set(inmsRef.map((i: any) => String(i.inmueble || '').toUpperCase()).filter(Boolean)));

      // Evaluar solvencia de los inmuebles vinculados
      const inmsConDeuda = inmsRef.filter(inmuebleTieneDeuda);
      const esSolventeDeuda = inmsRef.length > 0 && inmsConDeuda.length === 0;

      const montoFactura = parseFloat(String(
        retObj.total ||
        fd.monto_total ||
        det.monto_factura ||
        det.total_seleccionado ||
        det.montoTotal ||
        (parseFloat(String(p.monto || 0)) + montoRet)
      )) || parseFloat(String(p.monto || 0)) || 0;

      const ultimoEnvio =
        det.liberado_factura_enviada_at ||
        fd?.ultimo_envio_correo?.fecha ||
        retObj?.factura_enviada_at ||
        null;

      const itemObj = {
        pagoId: p.id,
        identidad: p.identidad,
        contribuyente: nombreContrib,
        codigosInmueble: codigosFinal,
        correo: correoCand,
        referencia: p.referencia || 'S/R',
        banco: p.banco || det.banco || 'N/A',
        tipoPago: p.tipo || det.tipo || 'Pago',
        fechaPago: det.fecha_transaccion || (p.created_at ? String(p.created_at).slice(0, 10) : ''),
        fechaEmision: fechaDocStr,
        esCierrePasado,
        montoPagado: parseFloat(String(p.monto || 0)) || 0,
        montoFactura: Math.round(montoFactura * 100) / 100,
        montoRetencion: Math.round(montoRet * 100) / 100,
        facturaEmitida,
        numeroFactura: fd?.numero_documento || null,
        numeroControl: fd?.numero_control || null,
        facturaUrl: fd?.url || fd?.raw_response?.resultado?.urlConsulta || retRow?.factura_url || null,
        liberadoSinPlanilla,
        liberadoAt: det.liberado_sin_planilla_at || null,
        liberadoPor: det.liberado_sin_planilla_por || null,
        retencionEstado,
        numeroPlanilla: retRow?.numero_planilla || det.comprobante_retencion || null,
        planillaUrl: retRow?.planilla_url || det.comprobante_retencion_url || null,
        esAgenteEnPadron,
        esSolventeDeuda,
        mesesDeudaMax: inmsRef.length > 0 ? Math.max(0, ...inmsRef.map((i: any) => parseInt(String(i.meses_deuda || 0), 10) || 0)) : 0,
        direccionFiscal: inmsRef[0]?.direccion || det.direccion || 'Municipio Naguanagua',
        telefono: inmsRef[0]?.telefono || '',
        ultimoEnvioCorreoAt: ultimoEnvio,
        recibos: det.recibos || [],
        montos: det.montos || {},
      };

      // Filtro por búsqueda `q`
      if (q.length >= 2) {
        const qLow = q.toLowerCase();
        const qClean = normId(q);
        const match =
          String(itemObj.identidad || '').toLowerCase().includes(qLow) ||
          (qClean.length >= 3 && normId(itemObj.identidad).includes(qClean)) ||
          String(itemObj.contribuyente || '').toLowerCase().includes(qLow) ||
          String(itemObj.referencia || '').toLowerCase().includes(qLow) ||
          String(itemObj.numeroFactura || '').toLowerCase().includes(qLow) ||
          String(itemObj.numeroControl || '').toLowerCase().includes(qLow) ||
          itemObj.codigosInmueble.some((c: string) => c.toLowerCase().includes(qLow) || queryCodes.has(c.toUpperCase())) ||
          queryIdents.has(String(itemObj.identidad || '').toUpperCase());
        if (!match) continue;
      }

      // Filtro por pestaña
      if (filtro === 'esperando_planilla') {
        if (!itemObj.facturaEmitida || itemObj.liberadoSinPlanilla || itemObj.retencionEstado === 'aprobada') continue;
      } else if (filtro === 'pendientes_emision') {
        if (itemObj.facturaEmitida) continue;
      } else if (filtro === 'liberados') {
        if (!itemObj.liberadoSinPlanilla) continue;
      }

      items.push(itemObj);
    }

    return NextResponse.json({
      success: true,
      total: items.length,
      items: items.slice(0, 300),
    });
  } catch (err: any) {
    console.error('[retenciones/liberar GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Error listando casos' }, { status: 500 });
  }
}

/**
 * POST /api/admin/retenciones/liberar
 * Acciones:
 *  - 'toggle_check': Marca/desmarca `detalles.liberado_sin_planilla` para liberar emisión/vista de factura y solvencia
 *    sin exigir planilla de retención y SIN alterar montos, fechas ni Libro de Ventas del cierre pasado.
 *  - 'enviar_factura_sin_planilla': Libera el pago sin planilla y envía inmediatamente el PDF de la factura emitida al correo del contribuyente.
 *  - 'toggle_padron_agente': Marca o desmarca `agente_retencion` en `inmuebles` / `condominios` para cobros futuros.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      accion,
      pagoId,
      liberar,
      desmarcarPadronFuturo,
      correoDestino,
      identidad,
      codigosInmueble,
      esAgente,
      usuario,
    } = body;

    const quien = String(usuario || 'Administrador').trim();
    const ahora = new Date().toISOString();

    if (accion === 'toggle_padron_agente') {
      const idStr = String(identidad || '').trim().toUpperCase();
      const codes: string[] = Array.isArray(codigosInmueble) ? codigosInmueble.map((c: any) => String(c || '').trim().toUpperCase()).filter(Boolean) : [];
      if (!idStr && codes.length === 0) {
        return NextResponse.json({ error: 'Falta identidad o código de inmueble.' }, { status: 400 });
      }
      const nuevoVal = Boolean(esAgente);
      if (codes.length > 0) {
        await supabase.from('inmuebles').update({ agente_retencion: nuevoVal }).in('inmueble', codes);
        await supabase.from('inmuebles').update({ agente_retencion: nuevoVal }).in('padre_id', codes);
        await supabase.from('condominios').update({ agente_retencion: nuevoVal }).in('codigo', codes);
      } else if (idStr) {
        const vars = getIdentidadVariantsExact(idStr);
        await supabase.from('inmuebles').update({ agente_retencion: nuevoVal }).in('identidad', vars.length ? vars : [idStr]);
        await supabase.from('condominios').update({ agente_retencion: nuevoVal }).in('identidad', vars.length ? vars : [idStr]);
      }

      await supabase.from('auditoria').insert({
        usuario: quien,
        accion: nuevoVal ? 'Contribuyente marcado como Agente de Retención en padrón' : 'Contribuyente desmarcado como Agente de Retención (Ex-Agente) para cobros futuros',
        categoria: 'FACTURACION',
        modulo: '/admin/liberacion-retenciones',
        detalles: { identidad: idStr, codigos: codes, agente_retencion: nuevoVal },
      });

      return NextResponse.json({ success: true, esAgenteEnPadron: nuevoVal });
    }

    if (!pagoId) {
      return NextResponse.json({ error: 'pagoId es requerido.' }, { status: 400 });
    }

    const { data: pago, error: errP } = await supabase
      .from('pagos_reportados')
      .select('id, identidad, monto, estado, referencia, tipo, detalles, created_at')
      .eq('id', pagoId)
      .maybeSingle();

    if (errP || !pago) {
      return NextResponse.json({ error: errP?.message || 'Pago no encontrado.' }, { status: 404 });
    }

    const det = parseDet(pago.detalles);
    const fd = det.factura_digital || {};

    if (accion === 'toggle_check') {
      const activar = Boolean(liberar);
      det.liberado_sin_planilla = activar;
      det.exonerado_planilla_retencion = activar;
      det.retencion_aprobada = activar ? true : false;
      det.liberado_sin_planilla_at = activar ? ahora : null;
      det.liberado_sin_planilla_por = activar ? quien : null;

      if (fd && typeof fd === 'object') {
        if (fd.retencion && typeof fd.retencion === 'object') {
          fd.retencion = {
            ...fd.retencion,
            estado: activar ? 'aprobada' : 'esperando_planilla',
            liberado_sin_planilla: activar,
          };
        }
        det.factura_digital = fd;
      }

      // IMPORTANTE: Solo actualizamos `detalles` (flags de liberación).
      // NO modificamos `monto`, `created_at`, `monto_retencion_iva`, `base_imponible`, `iva_monto` ni insertamos en `retenciones_iva`
      // para no alterar en absoluto el Libro de Ventas ni el cierre del mes pasado.
      const { error: errUp } = await supabase
        .from('pagos_reportados')
        .update({ detalles: det })
        .eq('id', pago.id);

      if (errUp) throw errUp;

      // Si existía un comprobante auxiliar RET-... vinculado en estado 'Por Verificar', pasarlo a 'Aprobado' para que no salga pendiente
      if (activar) {
        await supabase
          .from('pagos_reportados')
          .update({ estado: 'Aprobado' })
          .filter('detalles->>pago_vinculado', 'eq', pago.id);
      }

      if (activar && desmarcarPadronFuturo) {
        const codes = extraerCodigosDePago(det);
        if (codes.length > 0) {
          await supabase.from('inmuebles').update({ agente_retencion: false }).in('inmueble', codes);
          await supabase.from('inmuebles').update({ agente_retencion: false }).in('padre_id', codes);
        } else if (pago.identidad) {
          const vars = getIdentidadVariantsExact(pago.identidad);
          await supabase.from('inmuebles').update({ agente_retencion: false }).in('identidad', vars.length ? vars : [pago.identidad]);
        }
      }

      await supabase.from('auditoria').insert({
        usuario: quien,
        accion: activar
          ? 'Check activado: Liberación de factura y solvencia sin planilla de retención (sin alterar cierre)'
          : 'Check desactivado: Liberación sin planilla revertida',
        categoria: 'FACTURACION',
        modulo: '/admin/liberacion-retenciones',
        detalles: {
          pago_id: pago.id,
          identidad: pago.identidad,
          referencia: pago.referencia,
          numero_factura: fd?.numero_documento || null,
          liberado_sin_planilla: activar,
          desmarcar_padron_futuro: Boolean(desmarcarPadronFuturo),
        },
      });

      return NextResponse.json({
        success: true,
        liberadoSinPlanilla: activar,
        liberadoAt: activar ? ahora : null,
        liberadoPor: activar ? quien : null,
      });
    }

    if (accion === 'enviar_factura_sin_planilla') {
      const facturaUrl = fd?.url || fd?.raw_response?.resultado?.urlConsulta;
      const numeroControl = fd?.numero_control;
      const numeroDocumento = fd?.numero_documento;

      if (!fd?.emitida || !facturaUrl) {
        return NextResponse.json({
          error: 'Esta operación aún no tiene factura emitida en SENIAT / The Factory HKA. Use el botón "Emitir y Enviar Factura sin Planilla" para generarla y enviarla.',
        }, { status: 409 });
      }

      const correoInput = String(correoDestino || '').trim().toLowerCase();
      const correoResuelto = (correoInput && correoInput.includes('@') && !isFictitiousEmail(correoInput))
        ? correoInput
        : (await correoContribuyente(pago.identidad, det));

      // Si el operador ingresó un correo nuevo válido, guardarlo en el padrón del contribuyente para futuros envíos
      if (correoInput && correoInput.includes('@') && !isFictitiousEmail(correoInput)) {
        const codes = extraerCodigosDePago(det);
        if (codes.length > 0) {
          await supabase.from('inmuebles').update({ correo_electronico: correoInput }).in('inmueble', codes);
        }
        if (pago.identidad) {
          const vars = getIdentidadVariantsExact(pago.identidad);
          await supabase.from('contribuyentes').update({ email: correoInput }).in('identidad', vars.length ? vars : [pago.identidad]);
        }
      }

      const montoFactura = parseFloat(String(
        fd?.retencion?.total ||
        fd?.monto_total ||
        det?.monto_factura ||
        det?.total_seleccionado ||
        pago.monto ||
        0
      )) || 0;

      const contribNombre = det.contribuyente || det.contribuyente_nombre || pago.identidad || 'Contribuyente';

      const envio = await enviarFacturaConCopiaInterna({
        contribuyente: contribNombre,
        identidad: pago.identidad,
        numeroControl,
        numeroDocumento,
        monto: montoFactura,
        fecha: fd.fecha_emision || det.fecha_transaccion || pago.created_at,
        urlPdf: facturaUrl,
        correoContribuyente: correoResuelto || undefined,
        esCorreoComodin: !correoResuelto,
      });

      // Marcar también como liberado sin planilla y retención aprobada para que no salga pendiente en ningún módulo
      det.liberado_sin_planilla = true;
      det.exonerado_planilla_retencion = true;
      det.retencion_aprobada = true;
      det.liberado_sin_planilla_at = det.liberado_sin_planilla_at || ahora;
      det.liberado_sin_planilla_por = det.liberado_sin_planilla_por || quien;
      det.liberado_factura_enviada_at = ahora;
      det.liberado_factura_enviada_a = correoResuelto || 'archivo_interno';

      if (fd && typeof fd === 'object') {
        fd.ultimo_envio_correo = {
          fecha: ahora,
          destinatario: correoResuelto || 'archivo_interno',
          exito: envio.clienteEnviado || envio.copiaInternaEnviada,
          liberado_sin_planilla: true,
        };
        if (fd.retencion && typeof fd.retencion === 'object') {
          fd.retencion = {
            ...fd.retencion,
            estado: 'aprobada',
            liberado_sin_planilla: true,
            factura_enviada_at: correoResuelto && envio.clienteEnviado ? ahora : fd.retencion.factura_enviada_at,
            factura_enviada_a: correoResuelto || fd.retencion.factura_enviada_a,
          };
        }
        det.factura_digital = fd;
      }

      const { error: errUp } = await supabase
        .from('pagos_reportados')
        .update({ detalles: det })
        .eq('id', pago.id);

      if (errUp) throw errUp;

      // Si existía un comprobante auxiliar RET-... vinculado en estado 'Por Verificar', aprobarlo también
      await supabase
        .from('pagos_reportados')
        .update({ estado: 'Aprobado' })
        .filter('detalles->>pago_vinculado', 'eq', pago.id);

      await supabase.from('auditoria').insert({
        usuario: quien,
        accion: 'Factura enviada y liberada sin planilla de retención (sin modificar cierre pasado)',
        categoria: 'FACTURACION',
        modulo: '/admin/liberacion-retenciones',
        detalles: {
          pago_id: pago.id,
          identidad: pago.identidad,
          contribuyente: contribNombre,
          numero_factura: numeroDocumento,
          numero_control: numeroControl,
          correo: correoResuelto,
          cliente_enviado: envio.clienteEnviado,
          respaldo_enviado: envio.copiaInternaEnviada,
        },
      });

      return NextResponse.json({
        success: true,
        liberadoSinPlanilla: true,
        clienteEnviado: envio.clienteEnviado,
        respaldoEnviado: envio.copiaInternaEnviada,
        correo: correoResuelto,
        ultimoEnvioCorreoAt: ahora,
        error: !correoResuelto
          ? 'El contribuyente no tiene correo personal registrado; se envió copia al archivo fiscal interno y la factura quedó liberada para descarga en su portal.'
          : envio.error,
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (err: any) {
    console.error('[retenciones/liberar POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Error procesando solicitud' }, { status: 500 });
  }
}
