import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { TheFactoryHKA } from '@/lib/thefactoryhka';
import { enviarFacturaConCopiaInterna } from '@/lib/facturaMailer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { pagosIds, soloComerciales = true } = body;

    // 1. Obtener pagos candidatos pendientes de emitir
    let query = supabase
      .from('pagos_reportados')
      .select('*')
      .order('created_at', { ascending: false });

    if (pagosIds && Array.isArray(pagosIds) && pagosIds.length > 0) {
      query = query.in('id', pagosIds);
    } else {
      query = query.limit(100);
    }

    const { data: pagos, error: pagosErr } = await query;
    if (pagosErr) {
      throw pagosErr;
    }

    // Filtrar los que no tienen factura digital emitida
    const pendientes = (pagos || []).filter(pago => {
      let det = pago.detalles;
      if (typeof det === 'string') {
        try { det = JSON.parse(det); } catch { det = {}; }
      }
      det = det || {};
      const fd = det.factura_digital;
      return !(fd && (fd.emitida || fd.numero_control || fd.url));
    });

    if (pendientes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay facturas pendientes por emitir en este lote.',
        total: 0,
        procesados: 0,
        emitidos: 0,
        fallidos: 0,
        items: []
      });
    }

    const resultados: any[] = [];
    let emitidos = 0;
    let fallidos = 0;
    let omitidos = 0;

    const reqOrigin = new URL(request.url).origin;

    for (const pago of pendientes) {
      let det = pago.detalles;
      if (typeof det === 'string') {
        try { det = JSON.parse(det); } catch { det = {}; }
      }
      det = det || {};

      try {
        // Ejecutar emisión individual llamando al endpoint interno de emisión
        const emitRes = await fetch(`${reqOrigin}/api/admin/factura-digital/emitir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pagoId: pago.id,
            recibos: det.recibos || [`REC-${pago.id.slice(0, 6)}`],
            contribuyente: det.contribuyente || pago.identidad,
            identidad: pago.identidad,
            montoTotal: parseFloat(pago.monto || '0'),
            formasPago: [{
              descripcion: pago.tipo || 'Transferencia',
              fecha: pago.created_at || new Date().toISOString(),
              forma: '05',
              monto: parseFloat(pago.monto || '0')
            }],
            enviarCorreo: true
          })
        });

        const emitData = await emitRes.json();

        if (emitData.success) {
          if (emitData.skipped) {
            omitidos++;
            resultados.push({
              pagoId: pago.id,
              identidad: pago.identidad,
              estado: 'OMITIDO_RESIDENCIAL',
              mensaje: emitData.message || 'Omitido'
            });
          } else {
            emitidos++;
            resultados.push({
              pagoId: pago.id,
              identidad: pago.identidad,
              estado: 'EMITIDA',
              url: emitData.url,
              numeroControl: emitData.numeroControl || emitData.numero_control
            });
          }
        } else {
          fallidos++;
          resultados.push({
            pagoId: pago.id,
            identidad: pago.identidad,
            estado: 'ERROR',
            error: emitData.error || 'Fallo de emisión en The Factory'
          });
        }
      } catch (errPago: any) {
        fallidos++;
        resultados.push({
          pagoId: pago.id,
          identidad: pago.identidad,
          estado: 'ERROR',
          error: errPago.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      total: pendientes.length,
      procesados: resultados.length,
      emitidos,
      omitidos,
      fallidos,
      items: resultados
    });

  } catch (err: any) {
    console.error('Error en emisión por lote:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
