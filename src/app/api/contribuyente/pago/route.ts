import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { metodo, facturaIds, convenioIds, monto, referencia, banco, bancoDestino, fecha, identidad, reciboRefs } = body;
    // Servicios especiales / extraordinarios (referencias SRV-…) seleccionados en el portal
    // IVA retenido por agentes de retención (75%): activa el flujo de factura con comprobante de retención
    const montoRetencionIva = Math.max(0, Number(body.montoRetencionIva) || 0);
    const servicioRefs: string[] = Array.isArray(body.servicioRefs) ? body.servicioRefs.map(String).filter(Boolean) : [];

    if (!identidad || !monto || !metodo) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const rawId = String(identidad || '').trim().toUpperCase();
    const cleanIdentidad = /^[JVGE]\d+$/.test(rawId) ? `${rawId[0]}-${rawId.slice(1)}` : rawId;

    const fechaPago = fecha || new Date().toISOString().split('T')[0];
    const metodoNorm = String(metodo || '').trim().toLowerCase();

    const esTransferencia = [
      'transferencia',
      'transferencia_web',
      'transferencia (web)',
      'transferencia web',
      'pago_movil',
      'pago movil',
      'pago móvil',
    ].includes(metodoNorm);

    // En el portal Soy Contribuyente ÚNICAMENTE se permite Transferencia Bancaria (pasa a Conciliación 'Por Verificar').
    // Los pagos por Punto de Venta / Débito / Tarjeta son exclusivos de Caja Presencial (Taquilla).
    if (!esTransferencia) {
      return NextResponse.json(
        { error: 'En el portal Soy Contribuyente el único método de pago habilitado es Transferencia Bancaria.' },
        { status: 400 }
      );
    }

    // TRANSFERENCIA Y TRANSFERENCIA WEB: único método que pasa a Conciliación ('Por Verificar')
    if (esTransferencia) {
      const cleanRef = String(referencia || '').trim().replace(/\D/g, '');
      if (!cleanRef || cleanRef.length !== 8) {
        return NextResponse.json({ 
          error: 'El número de referencia de la transferencia debe contener exactamente 8 dígitos numéricos (mínimo y máximo 8 dígitos).' 
        }, { status: 400 });
      }

      const comprobanteUrl = body.comprobanteUrl || body.comprobante_url;
      if (!comprobanteUrl) {
        return NextResponse.json({ error: 'Es obligatorio adjuntar el comprobante de pago bancario.' }, { status: 400 });
      }

      const montoNum = parseFloat(String(monto).replace(/[^0-9.]/g, ''));
      if (isNaN(montoNum) || montoNum <= 0) {
        return NextResponse.json({ error: 'El monto reportado no es válido.' }, { status: 400 });
      }

      // Prevenir duplicidad de referencia bancaria (evita doble reporte / condición de carrera)
      const { data: dupPago } = await supabase
        .from('pagos_reportados')
        .select('id, estado')
        .eq('referencia', cleanRef)
        .neq('estado', 'Rechazado')
        .limit(1);

      if (dupPago && dupPago.length > 0) {
        return NextResponse.json(
          { error: `La referencia bancaria ${cleanRef} ya fue registrada previamente.` },
          { status: 409 }
        );
      }

      // Obtener referencias de recibos ANTES de insertar el pago
      const { data: recibosData } = (facturaIds && facturaIds.length > 0)
        ? await supabase.from('facturas').select('referencia').in('id', facturaIds)
        : { data: [] as any[] };
      const dbRefs = recibosData ? recibosData.map(r => r.referencia) : [];
      const finalRecibos = Array.from(new Set([...(reciboRefs || []), ...dbRefs]));

      // 1. Insertar primero en pagos_reportados y verificar que no haya error antes de bloquear recibos
      const { error: insertErr } = await supabase.from('pagos_reportados').insert({
        identidad: cleanIdentidad,
        monto: montoNum,
        banco: banco || metodo,
        referencia: cleanRef,
        tipo: 'Transferencia (Web)',
        estado: 'Por Verificar',
        detalles: JSON.stringify({
          origen: 'Portal Web (Soy Contribuyente)',
          banco_destino: bancoDestino || 'BANCAMIGA - 0172 - 0717',
          recibos: finalRecibos,
          recibosIds: facturaIds,
          conveniosIds: convenioIds,
          servicios: servicioRefs,
          comprobante_url: comprobanteUrl,
          monto_factura: Math.round((montoNum + montoRetencionIva) * 100) / 100,
          monto_neto_factura: montoNum,
          montoTotal: Math.round((montoNum + montoRetencionIva) * 100) / 100,
          ...(montoRetencionIva > 0 ? {
            monto_retencion_iva: montoRetencionIva,
            retencion_iva: montoRetencionIva,
            es_retencion: true,
            conRetencion: true,
            agente_retencion: true,
            es_agente_retencion: true,
          } : {}),
          fecha_transaccion: fechaPago
        })
      });

      if (insertErr) {
        console.error('Error insertando pago en pagos_reportados:', insertErr);
        return NextResponse.json({ error: 'No se pudo registrar el pago. Intente nuevamente.' }, { status: 500 });
      }

      // 2. Una sola actualización atómica por tabla para bloquear recibos en "Por Verificar"
      await Promise.all([
        facturaIds && facturaIds.length > 0
          ? supabase
              .from('facturas')
              .update({
                estado: 'Por Verificar',
                metodo_pago: banco || metodo,
                referencia_pago: cleanRef,
                fecha_pago: fechaPago
              })
              .in('id', facturaIds)
          : Promise.resolve(),
        convenioIds && convenioIds.length > 0
          ? supabase
              .from('convenios_pago')
              .update({
                estado: 'En Revisión',
                metodo_pago: banco || metodo,
                referencia_pago: cleanRef,
                fecha_pago: fechaPago
              })
              .in('id', convenioIds)
          : Promise.resolve(),
        servicioRefs.length > 0
          ? supabase
              .from('servicios_especiales')
              .update({ estado: 'Por Verificar' })
              .in('referencia', servicioRefs)
              .eq('estado', 'Pendiente')
          : Promise.resolve(),
      ]);
    } else {
      return NextResponse.json({ error: 'Método de pago no soportado' }, { status: 400 });
    }

    return NextResponse.json({
      status: 'pending',
      message: 'Pago reportado. Pendiente de validación por el equipo administrativo.'
    });

  } catch (err) {
    console.error('Error en pago:', err);
    return NextResponse.json({ error: 'Error en servidor' }, { status: 500 });
  }
}
