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

    // Cada emisión es un documento fiscal real: solo se emiten los pagos revisados y seleccionados explícitamente.
    if (pagosIds && Array.isArray(pagosIds) && pagosIds.length > 0) {
      query = query.in('id', pagosIds);
    } else {
      return NextResponse.json({ error: 'Debe indicar los pagos a emitir (pagosIds). No se emite en lote sin selección.' }, { status: 400 });
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
      if (det.es_pago_adicional === true || Boolean(det.pago_principal_id)) return false;
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
        const montoRet = parseFloat(String(det.monto_retencion_iva || det.retencion_iva || 0)) || 0;
        const esRet = !!(det.es_retencion || det.conRetencion || det.agente_retencion || montoRet > 0);
        let rcTotal = 0;
        if (det.recibo_caja) {
          try {
            const rc = typeof det.recibo_caja === 'string' ? JSON.parse(det.recibo_caja) : det.recibo_caja;
            if (Array.isArray(rc) && rc.length > 0) {
              rcTotal = rc.reduce((acc: number, r: any) => acc + (parseFloat(String(r.total || 0)) || 0), 0);
            }
          } catch(e) {}
        }

        const montoNeto = parseFloat(String(det.monto_neto_factura || 0));
        let montoFactura = 0;
        if (rcTotal > 0) {
          montoFactura = Math.round(rcTotal * 100) / 100;
        } else if (montoNeto > 0 && montoRet > 0) {
          montoFactura = Math.round((montoNeto + montoRet) * 100) / 100;
        } else if (det.monto_factura && parseFloat(det.monto_factura) > 0) {
          montoFactura = parseFloat(det.monto_factura);
        } else {
          const totalPagadoLote = (() => {
            if (Array.isArray(det?.pagos_agregados) && det.pagos_agregados.length > 0) {
              return det.pagos_agregados
                .filter((p: any) => !String(p?.metodo || p?.tipo || '').toLowerCase().includes('saldo a favor') && !String(p?.metodo || p?.tipo || '').toLowerCase().includes('nota de credito'))
                .reduce((s: number, p: any) => s + (parseFloat(String(p?.monto || 0)) || 0), 0);
            }
            return parseFloat(pago.monto || '0');
          })();
          const sFavorGen = parseFloat(String(det?.saldo_a_favor_nuevo || det?.monto_sobrante || det?.saldo_favor || 0)) || 0;
          montoFactura = Math.max(0, totalPagadoLote + (esRet ? montoRet : 0) - sFavorGen);
        }

        // Ejecutar emisión individual llamando al endpoint interno de emisión
        const emitRes = await fetch(`${reqOrigin}/api/admin/factura-digital/emitir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pagoId: pago.id,
            recibos: det.recibos || [`REC-${pago.id.slice(0, 6)}`],
            contribuyente: det.contribuyente || pago.identidad,
            identidad: pago.identidad,
            montoTotal: montoFactura,
            esRetencion: esRet,
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
