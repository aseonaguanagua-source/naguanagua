import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { descontarSaldoFavor } from '@/lib/saldoFavor';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identidad = body.identidad;
    const monto = body.monto;
    const referencia = body.referencia;
    const metodo = body.metodo || body.metodo_pago || body.tipo;
    const banco = body.banco || body.banco_origen;
    const bancoDestino = body.bancoDestino || body.banco_destino;
    const fecha = body.fecha || body.fecha_pago;
    const rawRecibosIds = body.facturaIds || body.facturas_ids || body.recibosIds || body.recibos_ids || [];
    const facturaIds = Array.isArray(rawRecibosIds) ? rawRecibosIds : [];
    const convenioIds = Array.isArray(body.convenioIds || body.convenios_ids) ? (body.convenioIds || body.convenios_ids) : [];
    const reciboRefs = Array.isArray(body.reciboRefs || body.recibos_refs || body.recibos) ? (body.reciboRefs || body.recibos_refs || body.recibos) : [];
    // Servicios especiales / extraordinarios (referencias SRV-…) seleccionados en el portal
    // IVA retenido por agentes de retención (75%): activa el flujo de factura con comprobante de retención
    const montoRetencionIva = Math.max(0, Number(body.montoRetencionIva ?? body.monto_retencion_iva) || 0);
    // Nota de Crédito / Saldo a Favor aplicado por inmueble desde Soy Contribuyente
    const saldoFavorUsado = Math.max(
      0,
      Math.round((Number(body.saldoFavorUsado ?? body.descuentoSaldoFavor ?? body.saldo_usado ?? body.nota_credito_usada) || 0) * 100) / 100
    );
    const notasCreditoPorInmueble: Record<string, number> =
      body.notasCreditoPorInmueble && typeof body.notasCreditoPorInmueble === 'object'
        ? body.notasCreditoPorInmueble
        : {};
    const servicioRefs: string[] = Array.isArray(body.servicioRefs || body.servicios_refs) ? (body.servicioRefs || body.servicios_refs).map(String).filter(Boolean) : [];

    if (!identidad || (monto === undefined && saldoFavorUsado <= 0) || !metodo) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const rawId = String(identidad || '').trim().toUpperCase();
    const cleanIdentidad = /^[JVGE]\d+$/.test(rawId) ? `${rawId[0]}-${rawId.slice(1)}` : rawId;

    const fechaPago = fecha || new Date().toISOString().split('T')[0];
    const metodoNorm = String(metodo || '').trim().toLowerCase();

    const esSaldoAFavorPuro = [
      'saldo_a_favor',
      'saldo a favor',
      'nota_de_credito',
      'nota de credito',
      'nota de crédito',
    ].includes(metodoNorm) && saldoFavorUsado > 0;

    const esTransferencia = [
      'transferencia',
      'transferencia_web',
      'transferencia (web)',
      'transferencia web',
      'pago_movil',
      'pago movil',
      'pago móvil',
    ].includes(metodoNorm) || esSaldoAFavorPuro;

    // En el portal Soy Contribuyente ÚNICAMENTE se permite Transferencia Bancaria (o aplicación de Nota de Crédito vigente).
    // Los pagos por Punto de Venta / Débito / Tarjeta son exclusivos de Caja Presencial (Taquilla).
    if (!esTransferencia) {
      return NextResponse.json(
        { error: 'En el portal Soy Contribuyente el único método de pago habilitado es Transferencia Bancaria.' },
        { status: 400 }
      );
    }

    // TRANSFERENCIA Y TRANSFERENCIA WEB (o Nota de Crédito): pasa a Conciliación ('Por Verificar')
    if (esTransferencia) {
      const montoNum = esSaldoAFavorPuro ? 0 : (parseFloat(String(monto).replace(/[^0-9.]/g, '')) || 0);
      if (!esSaldoAFavorPuro && (isNaN(montoNum) || montoNum <= 0)) {
        return NextResponse.json({ error: 'El monto reportado no es válido.' }, { status: 400 });
      }

      const cleanRef = esSaldoAFavorPuro
        ? `NC-${Date.now().toString().slice(-6)}`
        : String(referencia || '').trim().replace(/\D/g, '');
      if (!esSaldoAFavorPuro && (!cleanRef || cleanRef.length !== 8)) {
        return NextResponse.json({ 
          error: 'El número de referencia de la transferencia debe contener exactamente 8 dígitos numéricos (mínimo y máximo 8 dígitos).' 
        }, { status: 400 });
      }

      const comprobanteUrl = body.comprobanteUrl || body.comprobante_url || '';
      if (!esSaldoAFavorPuro && !comprobanteUrl) {
        return NextResponse.json({ error: 'Es obligatorio adjuntar el comprobante de pago bancario.' }, { status: 400 });
      }

      // Prevenir duplicidad de referencia bancaria (evita doble reporte / condición de carrera)
      if (!esSaldoAFavorPuro) {
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
      }

      // Obtener referencias de recibos ANTES de insertar el pago
      const { data: recibosData } = (facturaIds && facturaIds.length > 0)
        ? await supabase.from('facturas').select('referencia').in('id', facturaIds)
        : { data: [] as any[] };
      const dbRefs = recibosData ? recibosData.map(r => r.referencia) : [];
      const finalRecibos = Array.from(new Set([...(reciboRefs || []), ...dbRefs]));

      // Extraer códigos de inmueble e instantánea de deuda_previa al momento de reportar el pago
      const codigosInm = Array.from(new Set(
        finalRecibos
          .map((ref: string) => {
            const m = String(ref || '').match(/^(?:RECIB-HIST|CM|MULTA)-([A-Za-z0-9]+?)(?:-M\d+|-\d{2}-\d{4})?$/i);
            return m ? m[1].toUpperCase() : '';
          })
          .filter(Boolean)
      ));

      // Si se está aplicando Nota de Crédito, verificar en tiempo real en `documentos` que siga Vigente
      // para impedir cualquier duplicidad si ya se aplicó en Caja Taquilla o en otra pestaña
      if (saldoFavorUsado > 0) {
        const sinGuion = cleanIdentidad.replace(/-/g, '');
        const docIdentsCheck = Array.from(new Set([cleanIdentidad, sinGuion, rawId, ...codigosInm, ...Object.keys(notasCreditoPorInmueble)].filter(Boolean)));
        const { data: docsVig } = await supabase
          .from('documentos')
          .select('id, detalles')
          .eq('tipo', 'Nota de Credito')
          .eq('estado', 'Vigente')
          .in('identidad', docIdentsCheck);

        const seenIds = new Set<string>();
        const totalDisponibleDB = (docsVig || []).reduce((acc: number, d: any) => {
          if (!d?.id || seenIds.has(d.id)) return acc;
          seenIds.add(d.id);
          let det: any = {};
          try { det = typeof d.detalles === 'string' ? JSON.parse(d.detalles) : (d.detalles || {}); } catch {}
          const m = parseFloat(String(det.monto_bs ?? det.monto ?? '0').replace(/,/g, '.')) || 0;
          return acc + (m > 0 ? m : 0);
        }, 0);

        if (totalDisponibleDB + 0.05 < saldoFavorUsado) {
          return NextResponse.json(
            { error: 'La Nota de Crédito seleccionada ya fue aplicada o modificada en el sistema. Por favor recargue la página para actualizar su saldo.' },
            { status: 409 }
          );
        }
      }

      let deudaPrevia = Array.isArray(body.deuda_previa) && body.deuda_previa.length > 0 ? body.deuda_previa : null;
      if (!deudaPrevia && codigosInm.length > 0) {
        const { data: inmsSnap } = await supabase
          .from('inmuebles')
          .select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs')
          .in('inmueble', codigosInm);
        if (inmsSnap && inmsSnap.length > 0) {
          deudaPrevia = inmsSnap.map((i: any) => ({
            id: i.id,
            inmueble: i.inmueble,
            meses_deuda: Number(i.meses_deuda) || 0,
            deuda_mmv: Number(i.deuda_mmv) || 0,
            multa_bs: Number(i.multa_bs) || 0,
            deuda_congelada_bs: Number(i.deuda_congelada_bs) || 0,
            saldo_favor_bs: Number(i.saldo_favor_bs) || 0,
          }));
        }
      }
      const tasaBcvReportada = parseFloat(String(body.tasa_bcv || body.tasa_bcv_aplicada || 0)) || 0;
      const montosReportados = body.montos && typeof body.montos === 'object' ? body.montos : undefined;
      const codInmuebleStr = String(body.cod_inmueble || Object.keys(notasCreditoPorInmueble).join(', ') || codigosInm.join(', ') || '').trim() || undefined;
      const montoBrutoTotal = Math.round((montoNum + montoRetencionIva + saldoFavorUsado) * 100) / 100;

      const formasPagoList: any[] = [];
      if (saldoFavorUsado > 0) {
        formasPagoList.push({
          metodo: 'Saldo a Favor',
          descripcion: `Nota de Crédito (${Object.keys(notasCreditoPorInmueble).join(', ') || codInmuebleStr || 'Inmueble'})`,
          referencia: 'NOTA-CREDITO',
          monto: saldoFavorUsado,
        });
      }
      if (montoNum > 0) {
        formasPagoList.push({
          metodo: 'Transferencia',
          descripcion: banco || 'Transferencia (Web)',
          referencia: cleanRef,
          monto: montoNum,
        });
      }

      // 1. Insertar primero en pagos_reportados y verificar que no haya error antes de bloquear recibos
      const { error: insertErr } = await supabase.from('pagos_reportados').insert({
        identidad: cleanIdentidad,
        monto: esSaldoAFavorPuro ? saldoFavorUsado : montoNum,
        banco: esSaldoAFavorPuro ? 'Nota de Crédito / Saldo a Favor' : (banco || metodo),
        referencia: cleanRef,
        tipo: esSaldoAFavorPuro ? 'Saldo a Favor' : 'Transferencia (Web)',
        estado: 'Por Verificar',
        detalles: {
          origen: 'Portal Web (Soy Contribuyente)',
          banco_destino: esSaldoAFavorPuro ? 'NOTA DE CRÉDITO' : (bancoDestino || (String(banco || '').includes('0134') ? 'BANESCO - 0134 - 8636' : 'BANCAMIGA - 0172 - 0717')),
          recibos: finalRecibos,
          recibosIds: facturaIds,
          conveniosIds: convenioIds,
          servicios: servicioRefs,
          comprobante_url: comprobanteUrl || undefined,
          ...(codInmuebleStr ? { cod_inmueble: codInmuebleStr, codigo_inmueble: codInmuebleStr.split(',')[0].trim() } : {}),
          ...(deudaPrevia ? { deuda_previa: deudaPrevia } : {}),
          ...(body.periodos_pagados ? { periodos_pagados: String(body.periodos_pagados).trim(), periodos: String(body.periodos_pagados).trim() } : {}),
          ...(tasaBcvReportada > 0 ? { tasa_bcv: tasaBcvReportada, tasa_bcv_aplicada: tasaBcvReportada } : {}),
          ...(montosReportados ? { montos: montosReportados } : {}),
          total_seleccionado: montoBrutoTotal,
          monto_factura: montoBrutoTotal,
          monto_neto_factura: montoNum,
          montoTotal: montoBrutoTotal,
          ...(saldoFavorUsado > 0 ? {
            saldo_usado: saldoFavorUsado,
            saldo_favor_usado: saldoFavorUsado,
            descuentoSaldoFavor: saldoFavorUsado,
            descuento_saldo_favor: saldoFavorUsado,
            nota_credito_usada: saldoFavorUsado,
            saldo_favor_descontado_al_reportar: true,
            notas_credito_por_inmueble: notasCreditoPorInmueble,
            formasPago: formasPagoList,
          } : {}),
          ...(montoRetencionIva > 0 ? {
            monto_retencion_iva: montoRetencionIva,
            retencion_iva: montoRetencionIva,
            es_retencion: true,
            conRetencion: true,
            agente_retencion: true,
            es_agente_retencion: true,
          } : {}),
          fecha_transaccion: fechaPago
        }
      });

      if (insertErr) {
        console.error('Error insertando pago en pagos_reportados:', insertErr);
        return NextResponse.json({ error: 'No se pudo registrar el pago. Intente nuevamente.' }, { status: 500 });
      }

      // 1b. Descontar / marcar como Aplicada la Nota de Crédito por inmueble inmediatamente (interconectado con Caja sin duplicados)
      if (saldoFavorUsado > 0) {
        const entriesNC = Object.entries(notasCreditoPorInmueble).filter(([, m]) => Number(m) > 0.009);
        if (entriesNC.length > 0) {
          for (const [codInmNC, mNC] of entriesNC) {
            await descontarSaldoFavor(cleanIdentidad, Number(mNC), codInmNC, supabase);
          }
        } else {
          const primaryCodNC = codigosInm[0] || (codInmuebleStr ? codInmuebleStr.split(',')[0].trim() : undefined);
          await descontarSaldoFavor(cleanIdentidad, saldoFavorUsado, primaryCodNC, supabase);
        }
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
          ? (async () => {
              const cuotaIds: string[] = [];
              const pureConvIds: string[] = [];
              for (const rawId of convenioIds) {
                const str = String(rawId || '');
                if (str.startsWith('conv_')) {
                  const parts = str.split('_');
                  if (parts.length >= 3) {
                    cuotaIds.push(parts.slice(2).join('_'));
                  } else if (parts[1]) {
                    pureConvIds.push(parts[1]);
                  }
                } else {
                  pureConvIds.push(str);
                }
              }
              if (cuotaIds.length > 0) {
                await supabase
                  .from('convenios_cuotas')
                  .update({ estado: 'En Revisión' })
                  .in('id', cuotaIds);
              }
              if (pureConvIds.length > 0) {
                await supabase
                  .from('convenios_pago')
                  .update({
                    estado: 'En Revisión',
                    metodo_pago: banco || metodo,
                    referencia_pago: cleanRef,
                    fecha_pago: fechaPago
                  })
                  .in('id', pureConvIds);
              }
            })()
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
