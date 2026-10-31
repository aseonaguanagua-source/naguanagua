import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariants, getIdentidadVariantsExact } from '@/lib/formatters';
import { parseDet } from '@/lib/retencionFlujo';

export const dynamic = 'force-dynamic';

/**
 * Facturas de un agente de retención que esperan (o tienen) comprobante de retención.
 * Devuelve SOLO los datos para llenar la planilla (sin el enlace a la factura hasta que se apruebe).
 */
export async function GET(request: Request) {
  try {
    const identidad = new URL(request.url).searchParams.get('identidad') || '';
    if (!identidad) return NextResponse.json({ error: 'identidad requerida' }, { status: 400 });
    const variantes = /^[VEJPG][-_\s]?\d+$/i.test(identidad.trim()) ? getIdentidadVariantsExact(identidad) : getIdentidadVariants(identidad);

    const [{ data, error }, { data: inmsAg }] = await Promise.all([
      supabase
        .from('pagos_reportados')
        .select('id, identidad, monto, created_at, detalles, estado, referencia, grupo_pago')
        .in('identidad', variantes)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('inmuebles')
        .select('inmueble, agente_retencion, tipo')
        .in('identidad', variantes)
    ]);
    if (error) throw error;

    const esContribAgente = (inmsAg || []).some((i: any) => i.agente_retencion === true && !String(i.tipo || '').toUpperCase().includes('RESIDENCIAL'));

    const facturas: any[] = [];
    (data || []).forEach((p: any) => {
      if (['Rechazado', 'Anulado', 'Reversado'].includes(String(p?.estado || ''))) return;
      if (String(p?.referencia || '').startsWith('RECH-')) return;
      const det = parseDet(p.detalles);
      const esVinculoAutomaticoSinGrupo = Boolean(det?.vinculado_a_referencia) && !p.grupo_pago;
      if (!esVinculoAutomaticoSinGrupo && (det?.es_pago_adicional === true || Boolean(det?.pago_principal_id))) {
        const parentObj = det?.pago_principal_id ? (data || []).find((x: any) => x.id === det.pago_principal_id) : null;
        if (!det?.pago_principal_id || (parentObj && parentObj.estado === 'Aprobado')) return;
      }
      const fd = det.factura_digital || {};
      const r = fd.retencion || {};
      const retMonto = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || r.retenido || 0)) || 0;
      const esRet = det.es_retencion || det.agente_retencion || retMonto > 0 || !!r.estado || (esContribAgente && !String(det.tipo || '').toUpperCase().includes('RESIDENCIAL'));

      if (!esRet) return;

      const baseCalc = r.base || (det.total_seleccionado ? Math.round((det.total_seleccionado / 1.16) * 100) / 100 : (retMonto > 0 ? Math.round((retMonto / 0.12) * 100) / 100 : Math.round((parseFloat(p.monto || 0) / 1.16) * 100) / 100));
      const ivaCalc = r.iva || (baseCalc ? Math.round((baseCalc * 0.16) * 100) / 100 : (retMonto > 0 ? Math.round((retMonto / 0.75) * 100) / 100 : Math.round((parseFloat(p.monto || 0) - baseCalc) * 100) / 100));
      const totalCalc = r.total || (baseCalc + ivaCalc);
      const retCalculado = retMonto > 0 ? retMonto : Math.round((ivaCalc * 0.75) * 100) / 100;
      const pagadoCalc = r.pagado || (parseFloat(String(p.monto || 0)) || (totalCalc - retCalculado));

      // Determinar estado de la retención
      let estadoRet: any = r.estado || 'esperando_planilla';
      if (det.retencion_aprobada === true) estadoRet = 'aprobada';

      facturas.push({
        pagoId: p.id,
        fechaPago: det.fecha_transaccion || p.created_at,
        numeroFactura: fd.numero_documento || (fd.emitida ? '0' : 'En proceso de emisión'),
        numeroControl: fd.numero_control || 'En asignación',
        fechaEmision: fd.fecha_emision || det.fecha_transaccion || p.created_at?.split('T')[0] || null,
        base: r.base || baseCalc,
        exento: r.exento || 0,
        subtotal: r.subtotal || ((r.base || baseCalc) + (r.exento || 0)),
        iva: r.iva || ivaCalc,
        retenido: r.retenido || retCalculado,
        total: r.total || totalCalc,
        pagado: pagadoCalc,
        estado: estadoRet,
        motivoRechazo: estadoRet === 'rechazada' ? (r.motivo_rechazo || '') : undefined,
        // La factura solo se muestra cuando la retención fue aprobada
        facturaUrl: estadoRet === 'aprobada' ? (fd.url || null) : null,
      });
    });
    return NextResponse.json({ success: true, facturas });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
