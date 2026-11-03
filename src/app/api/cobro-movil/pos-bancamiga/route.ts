import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Endpoint puente para comunicación por red local / API con Punto de Venta Bancamiga.
 * Permite enviar la orden de cobro (monto + cédula del tarjetahabiente) al POS en red local
 * evitando bloqueos CORS del navegador.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { posIp, monto, cedulaTarjetahabiente, identidadContribuyente, referenciaInterna } = body;

    if (!posIp) {
      return NextResponse.json({ error: 'Debe indicar la dirección IP:Puerto del Punto de Venta Bancamiga.' }, { status: 400 });
    }

    const cleanHost = String(posIp).trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const montoCentimos = Math.round((Number(monto) || 0) * 100);
    const cedulaNums = String(cedulaTarjetahabiente || '').replace(/\D/g, '');

    // Intentar los endpoints estándar de integración local POS Bancamiga / PAX / Credicard / MegaSoft (Solo Débito)
    const payloadPos = {
      comando: 'COMPRA',
      accion: 'venta',
      tipoCuenta: 'DEBITO',
      modalidad: 'DEBITO',
      monto: Number(monto).toFixed(2),
      montoCentimos,
      cedula: cedulaNums,
      identificacion: cedulaTarjetahabiente,
      rifContribuyente: identidadContribuyente,
      factura: referenciaInterna || `CM-${Date.now().toString().slice(-6)}`,
      moneda: 'VES',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000); // 65s para que el usuario pase la tarjeta y ponga clave

    try {
      const res = await fetch(`http://${cleanHost}/api/venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadPos),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || data.estatus === 'RECHAZADO' || data.status === 'rejected') {
        return NextResponse.json(
          { error: data.mensaje || data.error || 'Transacción rechazada o cancelada en el Punto de Venta.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        referencia: String(data.referencia || data.numReferencia || data.secuencia || data.voucher || '').trim(),
        aprobacion: String(data.aprobacion || data.codAprobacion || data.autorizacion || '').trim(),
        lote: String(data.lote || data.numLote || '001').trim(),
        tarjeta: String(data.tarjeta || data.marca || 'Débito Bancamiga').trim(),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      return NextResponse.json(
        {
          error: `No se pudo establecer respuesta con el POS en ${cleanHost}. Verifique que el Punto Bancamiga esté encendido en la misma red Wi-Fi o use el modo Cable USB.`,
          details: fetchErr?.message || String(fetchErr),
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error procesando solicitud POS' }, { status: 500 });
  }
}

