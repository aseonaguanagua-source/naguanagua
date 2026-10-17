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

    const { data, error } = await supabase
      .from('pagos_reportados')
      .select('id, identidad, monto, created_at, detalles')
      .in('identidad', variantes)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const facturas: any[] = [];
    (data || []).forEach((p: any) => {
      const det = parseDet(p.detalles);
      const fd = det.factura_digital || {};
      const r = fd.retencion || {};
      const retMonto = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || r.retenido || 0)) || 0;
      const esRet = det.es_retencion || det.agente_retencion || retMonto > 0 || !!r.estado;

      if (!esRet) return;

      const baseCalc = r.base || (det.total_seleccionado ? Math.round((det.total_seleccionado / 1.16) * 100) / 100 : Math.round((retMonto / 0.12) * 100) / 100);
      const ivaCalc = r.iva || (baseCalc ? Math.round((baseCalc * 0.16) * 100) / 100 : Math.round((retMonto / 0.75) * 100) / 100);
      const totalCalc = r.total || (baseCalc + ivaCalc);
      const pagadoCalc = r.pagado || (parseFloat(String(p.monto || 0)) || (totalCalc - retMonto));

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
        iva: r.iva || ivaCalc,
        retenido: r.retenido || retMonto,
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
