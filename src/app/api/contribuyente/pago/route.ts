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
      const parseMontoNum = (raw: any): number => {
        if (typeof raw === 'number') return isFinite(raw) ? Math.round(raw * 100) / 100 : 0;
        const s = String(raw ?? '').trim();
        if (!s) return 0;
        const clean = s.includes(',')
          ? s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '')
          : s.replace(/[^0-9.]/g, '');
        return Math.round((parseFloat(clean) || 0) * 100) / 100;
      };

      const rawTransferencias = Array.isArray(body.transferencias) && body.transferencias.length > 0
        ? body.transferencias
        : null;

      interface TransferItemNorm {
        banco: string;
        bancoDestino: string;
        referencia: string;
        monto: number;
        fecha: string;
        comprobanteUrl: string;
      }

      const listaTransferencias: TransferItemNorm[] = [];

      if (esSaldoAFavorPuro) {
        // Sin transferencias bancarias
      } else if (rawTransferencias) {
        const seenRefsInBatch = new Set<string>();
        for (let idx = 0; idx < rawTransferencias.length; idx++) {
          const t = rawTransferencias[idx] || {};
          const m = parseMontoNum(t.monto);
          if (isNaN(m) || m <= 0) {
            return NextResponse.json({ error: `El monto de la transferencia #${idx + 1} no es válido.` }, { status: 400 });
          }
          const cRef = String(t.referencia || '').trim().replace(/\D/g, '');
          if (!cRef || cRef.length !== 8) {
            return NextResponse.json({
              error: `La referencia de la transferencia #${idx + 1} debe contener exactamente 8 dígitos numéricos.`
            }, { status: 400 });
          }
          if (seenRefsInBatch.has(cRef)) {
            return NextResponse.json({
              error: `La referencia bancaria ${cRef} está repetida en la lista de transferencias.`
            }, { status: 400 });
          }
          seenRefsInBatch.add(cRef);
          const compUrl = String(t.comprobanteUrl || t.comprobante_url || '').trim();
          if (!compUrl) {
            return NextResponse.json({
              error: `Debe adjuntar el comprobante de la transferencia #${idx + 1} (Ref. ${cRef}).`
            }, { status: 400 });
          }
          const bOrig = String(t.banco || t.bancoOrigen || t.banco_origen || metodo).trim();
          const bDest = String(
            t.bancoDestino ||
            t.banco_destino ||
            (bOrig.includes('0134') ? 'BANESCO - 0134 - 8636' : 'BANCAMIGA - 0172 - 0717')
          ).trim();
          listaTransferencias.push({
            banco: bOrig,
            bancoDestino: bDest,
            referencia: cRef,
            monto: m,
            fecha: String(t.fecha || t.fecha_pago || fechaPago).trim() || fechaPago,
            comprobanteUrl: compUrl,
          });
        }
      } else {
        const mSingle = parseMontoNum(monto);
        if (isNaN(mSingle) || mSingle <= 0) {
          return NextResponse.json({ error: 'El monto reportado no es válido.' }, { status: 400 });
        }
        const cRefSingle = String(referencia || '').trim().replace(/\D/g, '');
        if (!cRefSingle || cRefSingle.length !== 8) {
          return NextResponse.json({
            error: 'El número de referencia de la transferencia debe contener exactamente 8 dígitos numéricos (mínimo y máximo 8 dígitos).'
          }, { status: 400 });
        }
        const compUrlSingle = String(body.comprobanteUrl || body.comprobante_url || '').trim();
        if (!compUrlSingle) {
          return NextResponse.json({ error: 'Es obligatorio adjuntar el comprobante de pago bancario.' }, { status: 400 });
        }
        const bOrigSingle = String(banco || metodo).trim();
        const bDestSingle = String(
          bancoDestino || (bOrigSingle.includes('0134') ? 'BANESCO - 0134 - 8636' : 'BANCAMIGA - 0172 - 0717')
        ).trim();
        listaTransferencias.push({
          banco: bOrigSingle,
          bancoDestino: bDestSingle,
          referencia: cRefSingle,
          monto: mSingle,
          fecha: fechaPago,
          comprobanteUrl: compUrlSingle,
        });
      }

      const montoNum = esSaldoAFavorPuro
        ? 0
        : Math.round(listaTransferencias.reduce((acc, t) => acc + t.monto, 0) * 100) / 100;
      const cleanRef = esSaldoAFavorPuro
        ? `NC-${Date.now().toString().slice(-6)}`
        : listaTransferencias[0].referencia;
      const comprobanteUrl = esSaldoAFavorPuro ? '' : listaTransferencias[0].comprobanteUrl;

      // Prevenir duplicidad de referencia bancaria (evita doble reporte / condición de carrera)
      if (!esSaldoAFavorPuro && listaTransferencias.length > 0) {
        const allRefsCheck = listaTransferencias.map(t => t.referencia);
        const { data: dupPago } = await supabase
          .from('pagos_reportados')
          .select('id, referencia, estado')
          .in('referencia', allRefsCheck)
          .neq('estado', 'Rechazado')
          .limit(1);

        if (dupPago && dupPago.length > 0) {
          return NextResponse.json(
            { error: `La referencia bancaria ${dupPago[0].referencia || cleanRef} ya fue registrada previamente.` },
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
          .in('tipo', ['Nota de Credito', 'Nota de Crédito', 'Saldo a Favor', 'nota_de_credito'])
          .eq('estado', 'Vigente')
          .in('identidad', docIdentsCheck);

        const seenIds = new Set<string>();
        const totalDocsDB = (docsVig || []).reduce((acc: number, d: any) => {
          if (!d?.id || seenIds.has(d.id)) return acc;
          seenIds.add(d.id);
          let det: any = {};
          try { det = typeof d.detalles === 'string' ? JSON.parse(d.detalles) : (d.detalles || {}); } catch {}
          const m = parseFloat(String(det.monto_bs ?? det.monto ?? '0').replace(/,/g, '.')) || 0;
          return acc + (m > 0 ? m : 0);
        }, 0);

        // Si no está todo en documentos, corroborar también en inmuebles.saldo_favor_bs
        let totalDisponibleDB = totalDocsDB;
        if (totalDisponibleDB + 0.05 < saldoFavorUsado) {
          const { data: inmsSaldo } = await supabase
            .from('inmuebles')
            .select('saldo_favor_bs')
            .in('identidad', docIdentsCheck);
          const sumInmsSaldo = (inmsSaldo || []).reduce((acc: number, i: any) => acc + (parseFloat(String(i.saldo_favor_bs || 0)) || 0), 0);
          totalDisponibleDB = Math.max(totalDisponibleDB, sumInmsSaldo, totalDocsDB + sumInmsSaldo);
        }

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
      const pagosAgregadosList: any[] = [];
      if (saldoFavorUsado > 0) {
        formasPagoList.push({
          metodo: 'Saldo a Favor',
          descripcion: `Nota de Crédito (${Object.keys(notasCreditoPorInmueble).join(', ') || codInmuebleStr || 'Inmueble'})`,
          referencia: 'NOTA-CREDITO',
          monto: saldoFavorUsado,
          forma: '99',
        });
        pagosAgregadosList.push({
          metodo: 'Saldo a Favor',
          tipo: 'Saldo a Favor',
          banco: 'Nota de Crédito / Saldo a Favor',
          referencia: 'NOTA-CREDITO',
          monto: saldoFavorUsado,
          fecha: fechaPago,
          fechaTransaccion: fechaPago,
        });
      }
      for (const t of listaTransferencias) {
        formasPagoList.push({
          metodo: 'Transferencia',
          tipo: 'Transferencia',
          forma: '03',
          descripcion: t.banco || 'Transferencia (Web)',
          banco: t.banco,
          bancoDestino: t.bancoDestino,
          referencia: t.referencia,
          monto: t.monto,
          fecha: `${t.fecha}T12:00:00.000Z`,
          comprobante_url: t.comprobanteUrl,
        });
        pagosAgregadosList.push({
          metodo: 'Transferencia (Web)',
          tipo: 'Transferencia (Web)',
          banco: t.banco,
          bancoDestino: t.bancoDestino,
          referencia: t.referencia,
          monto: t.monto,
          fecha: t.fecha,
          fechaTransaccion: t.fecha,
          comprobante_url: t.comprobanteUrl,
        });
      }

      const esMultiTransf = listaTransferencias.length > 1;
      const mainPagoId = crypto.randomUUID();
      const grupoId = esMultiTransf ? mainPagoId : null;

      const baseDetallesCommon: Record<string, any> = {
        origen: 'Portal Web (Soy Contribuyente)',
        recibos: finalRecibos,
        recibosIds: facturaIds,
        conveniosIds: convenioIds,
        servicios: servicioRefs,
        ...(codInmuebleStr ? { cod_inmueble: codInmuebleStr, codigo_inmueble: codInmuebleStr.split(',')[0].trim() } : {}),
        ...(deudaPrevia ? { deuda_previa: deudaPrevia } : {}),
        ...(body.periodos_pagados ? { periodos_pagados: String(body.periodos_pagados).trim(), periodos: String(body.periodos_pagados).trim() } : {}),
        ...(tasaBcvReportada > 0 ? { tasa_bcv: tasaBcvReportada, tasa_bcv_aplicada: tasaBcvReportada } : {}),
        ...(montosReportados ? { montos: montosReportados } : {}),
        total_seleccionado: montoBrutoTotal,
        monto_factura: montoBrutoTotal,
        monto_neto_factura: montoNum,
        montoTotal: montoBrutoTotal,
        formasPago: formasPagoList,
        ...((esMultiTransf || pagosAgregadosList.length > 1) ? {
          es_pago_multiple: true,
          pagos_agregados: pagosAgregadosList,
        } : {}),
        ...(saldoFavorUsado > 0 ? {
          saldo_usado: saldoFavorUsado,
          saldo_favor_usado: saldoFavorUsado,
          descuentoSaldoFavor: saldoFavorUsado,
          descuento_saldo_favor: saldoFavorUsado,
          nota_credito_usada: saldoFavorUsado,
          saldo_favor_descontado_al_reportar: true,
          notas_credito_por_inmueble: notasCreditoPorInmueble,
        } : {}),
        ...(montoRetencionIva > 0 ? {
          monto_retencion_iva: montoRetencionIva,
          retencion_iva: montoRetencionIva,
          es_retencion: true,
          conRetencion: true,
          agente_retencion: true,
          es_agente_retencion: true,
        } : {}),
      };

      const rowsToInsert: any[] = [];
      if (esSaldoAFavorPuro) {
        rowsToInsert.push({
          id: mainPagoId,
          identidad: cleanIdentidad,
          monto: saldoFavorUsado,
          banco: 'Nota de Crédito / Saldo a Favor',
          referencia: cleanRef,
          tipo: 'Saldo a Favor',
          estado: 'Por Verificar',
          detalles: {
            ...baseDetallesCommon,
            banco_destino: 'NOTA DE CRÉDITO',
            fecha_transaccion: fechaPago,
          },
        });
      } else {
        listaTransferencias.forEach((t, idx) => {
          const isMain = idx === 0;
          const rowId = isMain ? mainPagoId : crypto.randomUUID();
          rowsToInsert.push({
            id: rowId,
            identidad: cleanIdentidad,
            monto: t.monto,
            banco: t.banco,
            referencia: t.referencia,
            tipo: 'Transferencia (Web)',
            estado: 'Por Verificar',
            ...(grupoId ? { grupo_pago: grupoId } : {}),
            detalles: {
              ...baseDetallesCommon,
              banco_destino: t.bancoDestino,
              comprobante_url: t.comprobanteUrl,
              fecha_transaccion: t.fecha,
              ...(esMultiTransf ? {
                pago_principal_id: mainPagoId,
                es_pago_adicional: !isMain,
                tipo_registro_multi: isMain ? 'ANTICIPO' : 'DIFERENCIA',
                grupo_pago: {
                  id: grupoId,
                  parte: idx + 1,
                  partes: listaTransferencias.length,
                  monto_total: montoNum,
                },
              } : {}),
            },
          });
        });
      }

      // 1. Insertar primero en pagos_reportados y verificar que no haya error antes de bloquear recibos
      const { error: insertErr } = await supabase.from('pagos_reportados').insert(rowsToInsert);

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
