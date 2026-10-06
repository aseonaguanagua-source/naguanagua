import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getIdentidadVariants } from '@/lib/formatters';
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
    const variantes = getIdentidadVariants(identidad);

    const { data, error } = await supabase
      .from('pagos_reportados')
      .select('id, identidad, monto, created_at, detalles')
      .in('identidad', variantes)
      .not('detalles->factura_digital->retencion', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const facturas = (data || []).map((p: any) => {
      const det = parseDet(p.detalles);
      const fd = det.factura_digital || {};
      const r = fd.retencion || {};
      return {
        pagoId: p.id,
        fechaPago: det.fecha_transaccion || p.created_at,
        numeroFactura: fd.numero_documento || '',
        numeroControl: fd.numero_control || '',
        fechaEmision: fd.fecha_emision || null,
        base: r.base, iva: r.iva, retenido: r.retenido, total: r.total, pagado: r.pagado,
        estado: r.estado,
        motivoRechazo: r.estado === 'rechazada' ? (r.motivo_rechazo || '') : undefined,
        // La factura solo se muestra cuando la retención fue aprobada
        facturaUrl: r.estado === 'aprobada' ? (fd.url || null) : null,
      };
    });
    return NextResponse.json({ success: true, facturas });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
