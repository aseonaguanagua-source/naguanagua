import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const {
      pagoId,
      identidad,
      contribuyente,
      monto,
      referencia,
      esRetencion,
      modulo,
      marcarAnulada,
      fecha,
      concepto,
      usuario
    } = await req.json();

    if (!pagoId) {
      return NextResponse.json({ error: 'ID de pago requerido.' }, { status: 400 });
    }

    const u = String(usuario || 'Administrador').trim().toLowerCase();
    let cleanUser = u.includes('(') ? u.split('(')[1].replace(')', '').trim() : u;
    cleanUser = cleanUser.replace(/^[a-z]-/i, '').trim();
    const { data: trab } = await sb.from('trabajadores').select('usuario, rol').ilike('usuario', cleanUser).maybeSingle();
    const esAdmin = !!trab && (trab.rol === 'Administrador' || trab.rol === 'Personalizado');
    const allowed = ['isamar', 'raquel', 'dzara', 'nell', 'admin', 'administrador', 'cajero', 'supervisor'];
    if (!esAdmin && !allowed.includes(cleanUser) && cleanUser.length > 0) {
      return NextResponse.json({ error: 'Solo administradores pueden editar datos fiscales del pago.' }, { status: 403 });
    }

    const { data: pago, error: pErr } = await sb.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
    if (pErr || !pago) {
      return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
    }

    let det: any = pago.detalles || {};
    if (typeof det === 'string') {
      try { det = JSON.parse(det); } catch { det = {}; }
    }

    const nuevoMonto = monto !== undefined && monto !== null && !isNaN(parseFloat(String(monto)))
      ? Math.round((parseFloat(String(monto)) + Number.EPSILON) * 100) / 100
      : pago.monto;

    const nuevaIdentidad = String(identidad || pago.identidad || '').trim().toUpperCase();
    const nuevaRef = String(referencia || pago.referencia || '').trim();
    const nuevoModulo = modulo === 'condominios' ? 'condominios' : 'caja';
    const nuevoNombre = String(contribuyente || det.contribuyente || det.contribuyente_nombre || '').trim();
    const flagRetencion = esRetencion !== undefined ? !!esRetencion : (det.agente_retencion || det.es_retencion || false);

    // Comprobar si el monto realmente fue alterado por el usuario
    const montoAnterior = parseFloat(String(pago.monto || 0));
    const montoConciliadoAnterior = parseFloat(String(det.monto_conciliado || det.formasPago?.[0]?.monto || 0));
    const montoCambio = Math.abs(nuevoMonto - montoAnterior) > 0.05 && Math.abs(nuevoMonto - montoConciliadoAnterior) > 0.05;

    // Si el monto no cambió, preservar el monto_factura y retenciones calculados previamente (corrigiendo si monto_factura tenía el neto pagado)
    const calculoRetencion = (() => {
      const mRetPrev = parseFloat(String(det.monto_retencion_iva ?? det.retencion_iva ?? 0)) || 0;
      const mFacPrev = parseFloat(String(det.monto_factura || 0)) || 0;
      const mNetoPrev = parseFloat(String(det.monto_neto_factura || 0)) || 0;
      const esMFacPrevNeto = flagRetencion && mRetPrev > 0 && mFacPrev > 0 && (
        (mNetoPrev > 0 && Math.abs(mFacPrev - mNetoPrev) < 1) ||
        (Math.abs(mFacPrev - nuevoMonto) < 1 && Math.abs(mFacPrev - (mRetPrev * 26 / 3)) < 25)
      );
      if (!montoCambio && mFacPrev > 0) {
        return {
          monto_factura: esMFacPrevNeto ? Math.round((mFacPrev + mRetPrev) * 100) / 100 : mFacPrev,
          monto_retencion_iva: mRetPrev,
          retencion_iva: mRetPrev,
          porcentaje_retencion: det.porcentaje_retencion ?? (flagRetencion ? 75 : 0),
          conRetencion: flagRetencion
        };
      }
      if (flagRetencion) {
        const base = parseFloat((nuevoMonto / 1.04).toFixed(2));
        const iva = parseFloat((base * 0.16).toFixed(2));
        const retencion = parseFloat((iva * 0.75).toFixed(2));
        const totalFactura = parseFloat((base + iva).toFixed(2));
        return {
          monto_factura: totalFactura,
          monto_retencion_iva: retencion,
          retencion_iva: retencion,
          porcentaje_retencion: 75,
          conRetencion: true
        };
      }
      return {
        monto_factura: det.monto_factura || nuevoMonto,
        monto_retencion_iva: 0,
        retencion_iva: 0,
        conRetencion: false
      };
    })();

    const nuevosDetalles = {
      ...det,
      contribuyente: nuevoNombre,
      contribuyente_nombre: nuevoNombre,
      referencia: nuevaRef,
      referencia_origen: nuevaRef,
      agente_retencion: flagRetencion,
      es_retencion: flagRetencion,
      modulo: nuevoModulo,
      ...calculoRetencion,
      ...(marcarAnulada ? {
        factura_digital: {
          ...(det.factura_digital || {}),
          anulada: true,
          nota_credito: det.factura_digital?.nota_credito || {
            emitida: true,
            numero_documento: 'ANULADA-MANUAL',
            numero_control: 'NC-MANUAL',
            fecha_emision: new Date().toISOString(),
            manual: true
          }
        }
      } : {}),
      historial_edicion_fiscal: [
        ...(Array.isArray(det.historial_edicion_fiscal) ? det.historial_edicion_fiscal : []),
        {
          fecha: new Date().toISOString(),
          usuario: cleanUser,
          anterior: {
            identidad: pago.identidad,
            monto: pago.monto,
            referencia: pago.referencia,
            modulo: pago.modulo,
            contribuyente: det.contribuyente,
            es_retencion: det.es_retencion || det.agente_retencion
          },
          nuevo: {
            identidad: nuevaIdentidad,
            monto: nuevoMonto,
            referencia: nuevaRef,
            modulo: nuevoModulo,
            contribuyente: nuevoNombre,
            es_retencion: flagRetencion
          }
        }
      ]
    };

    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      nuevosDetalles.fecha_transaccion = fecha;
      nuevosDetalles.fecha_banco = fecha;
      if (Array.isArray(nuevosDetalles.recibo_caja) && nuevosDetalles.recibo_caja[0]) {
        nuevosDetalles.recibo_caja[0].fechaTransaccion = fecha;
      }
    }

    if (concepto !== undefined) {
      const cleanConcepto = String(concepto).trim();
      nuevosDetalles.concepto = cleanConcepto;
      nuevosDetalles.detalle = cleanConcepto;
      nuevosDetalles.mes_aseo = cleanConcepto;
      if (Array.isArray(nuevosDetalles.recibo_caja)) {
        nuevosDetalles.recibo_caja.forEach((rc: any) => {
          if (rc) {
            rc.concepto = cleanConcepto;
            rc.detalle = cleanConcepto;
          }
        });
      }
    }

    // Actualizar monto pagado en formasPago y monto_conciliado si el monto fue modificado expresamente
    if (montoCambio) {
      nuevosDetalles.monto_conciliado = String(nuevoMonto);
      if (Array.isArray(nuevosDetalles.formasPago) && nuevosDetalles.formasPago[0]) {
        nuevosDetalles.formasPago[0].monto = nuevoMonto;
      }
    }

    const updatePayload: any = {
      identidad: nuevaIdentidad,
      monto: montoCambio ? nuevoMonto : pago.monto,
      referencia: nuevaRef,
      modulo: nuevoModulo,
      detalles: nuevosDetalles,
      ...(fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? { created_at: `${fecha}T12:00:00-04:00` } : {})
    };

    const { error: upErr } = await sb.from('pagos_reportados').update(updatePayload).eq('id', pagoId);
    if (upErr) {
      return NextResponse.json({ error: 'Error al actualizar pago: ' + upErr.message }, { status: 500 });
    }

    // Registrar en auditoría
    await sb.from('auditoria').insert({
      accion: 'Edición de Pago Fiscal',
      usuario: cleanUser,
      detalles: {
        _categoria: 'FACTURACION',
        criticidad: 'MEDIA',
        pagoId,
        anterior: { identidad: pago.identidad, monto: pago.monto, referencia: pago.referencia },
        nuevo: { identidad: nuevaIdentidad, monto: nuevoMonto, referencia: nuevaRef, contribuyente: nuevoNombre, esRetencion: flagRetencion, modulo: nuevoModulo }
      }
    });

    return NextResponse.json({
      ok: true,
      success: true,
      pago: {
        ...pago,
        ...updatePayload
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error en el servidor' }, { status: 500 });
  }
}
