import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariants } from '@/lib/formatters';
import { parseDet } from '@/lib/retencionFlujo';

export const dynamic = 'force-dynamic';

/**
 * El agente de retención sube su comprobante para una factura emitida.
 * Crea el registro en retenciones_iva (estado Pendiente) y marca el pago como "planilla_recibida".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pagoId = body.pagoId || body.pago_id;
    const numeroComprobante = body.numeroComprobante || body.numComprobante || body.numero_comprobante;
    const fechaComprobante = body.fechaComprobante || body.fechaEmision || body.fecha_retencion || body.fecha_emision || null;
    const montoRetenidoReq = body.montoRetenido ?? body.monto_retenido;
    const porcentajeRetencionReq = body.porcentajeRetencion ?? body.porcentaje ?? body.porcentaje_retencion;
    const planillaUrl = body.planillaUrl || body.comprobanteUrl || body.archivo_url || body.comprobante_url;
    const identidadReq = body.identidad;

    if (!pagoId) return NextResponse.json({ error: 'Faltan datos (identidad / factura).' }, { status: 400 });
    if (!String(numeroComprobante || '').trim()) return NextResponse.json({ error: 'Indique el número del comprobante de retención.' }, { status: 400 });
    if (!String(planillaUrl || '').trim()) return NextResponse.json({ error: 'Debe adjuntar el comprobante de retención (PDF o imagen).' }, { status: 400 });

    const { data: pago, error } = await supabase.from('pagos_reportados').select('id, identidad, monto, estado, detalles').eq('id', pagoId).maybeSingle();
    if (error) throw error;
    const identidad = identidadReq || pago?.identidad;
    if (!pago || !identidad || !getIdentidadVariants(identidad).includes(pago.identidad)) {
      return NextResponse.json({ error: 'La factura no corresponde a este contribuyente.' }, { status: 403 });
    }
    const det = parseDet(pago.detalles);
    const fd = det.factura_digital || {};
    const retMonto = parseFloat(String(montoRetenidoReq ?? det.monto_retencion_iva ?? det.retencion_iva ?? fd.retencion?.retenido ?? 0)) || 0;
    const esRet = det.es_retencion || det.agente_retencion || retMonto > 0 || !!fd.retencion;
    if (!esRet) return NextResponse.json({ error: 'Este pago no requiere comprobante de retención.' }, { status: 400 });

    const ret = fd.retencion || {};
    if (ret.estado === 'aprobada' || det.retencion_aprobada === true) return NextResponse.json({ error: 'El comprobante de esta retención ya fue aprobado.' }, { status: 409 });
    if (ret.estado === 'planilla_recibida' || ret.estado === 'por_verificar') return NextResponse.json({ error: 'Ya hay un comprobante en revisión para este pago.' }, { status: 409 });

    const pctRet = Number(porcentajeRetencionReq || ret.porcentaje_retencion || det.porcentaje_retencion || 75) || 75;
    const baseCalc = ret.base || (det.total_seleccionado ? Math.round((det.total_seleccionado / 1.16) * 100) / 100 : Math.round((retMonto / (0.16 * (pctRet / 100))) * 100) / 100);
    const ivaCalc = ret.iva || (baseCalc ? Math.round((baseCalc * 0.16) * 100) / 100 : Math.round((retMonto / (pctRet / 100)) * 100) / 100);
    const totalCalc = ret.total || (baseCalc + ivaCalc);
    const retenidoCalc = (montoRetenidoReq !== undefined && montoRetenidoReq !== null && Number(montoRetenidoReq) > 0)
      ? Number(montoRetenidoReq)
      : (ret.retenido || retMonto);

    const { data: inmLink } = await supabase.from('inmuebles').select('inmueble, contribuyente').eq('identidad', pago.identidad).eq('agente_retencion', true).limit(1).maybeSingle();
    const fechaEmi = fd.fecha_emision ? new Date(fd.fecha_emision) : new Date();
    const periodo = `${String(fechaEmi.getMonth() + 1).padStart(2, '0')}/${fechaEmi.getFullYear()}`;

    const { data: ins, error: eIns } = await supabase.from('retenciones_iva').insert({
      identidad: pago.identidad,
      contribuyente: det.contribuyente || inmLink?.contribuyente || pago.identidad,
      codigo_inmueble: inmLink?.inmueble || null,
      numero_planilla: String(numeroComprobante).trim(),
      periodo,
      fecha_planilla: fechaComprobante || null,
      monto_base: baseCalc,
      monto_iva: ivaCalc,
      monto_retenido: retenidoCalc,
      codigo_retencion: `FAC-${fd.numero_documento || ''}`,
      planilla_url: planillaUrl,
      estado: 'Pendiente',
      factura_control: fd.numero_control || null,
      factura_url: fd.url || fd.raw_response?.resultado?.urlConsulta || null,
      factura_emitida: !!fd.emitida,
    }).select('id').single();
    if (eIns) throw eIns;

    fd.retencion = {
      ...ret,
      base: baseCalc,
      iva: ivaCalc,
      total: totalCalc,
      retenido: retenidoCalc,
      porcentaje_retencion: pctRet,
      numero_comprobante: String(numeroComprobante).trim(),
      fecha_comprobante: fechaComprobante || null,
      comprobante_url: planillaUrl,
      pagado: ret.pagado || (parseFloat(String(pago.monto || 0)) || (totalCalc - retenidoCalc)),
      estado: 'planilla_recibida',
      estado_revision: 'por_verificar',
      retencion_id: ins.id,
      planilla_recibida_at: new Date().toISOString(),
      motivo_rechazo: undefined
    };
    det.factura_digital = fd;
    // IMPORTANTE: Si el pago principal ya está Aprobado o Conciliado, NO degradar su estado a 'Por Verificar'
    const estadoPagoPreservado = (pago.estado === 'Aprobado' || pago.estado === 'Conciliado')
      ? pago.estado
      : (pago.estado || 'Por Verificar');
    const { error: eUp } = await supabase.from('pagos_reportados').update({ estado: estadoPagoPreservado, detalles: det }).eq('id', pagoId);
    if (eUp) throw eUp;

    await supabase.from('auditoria').insert({
      usuario: `Portal ${pago.identidad}`, accion: 'Comprobante de retención recibido', categoria: 'FACTURACION', modulo: '/portal/retenciones',
      detalles: { pago_id: pagoId, retencion_id: ins.id, factura: fd.numero_documento, comprobante: numeroComprobante, monto_retenido: ret.retenido },
    });

    return NextResponse.json({ success: true, retencionId: ins.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
