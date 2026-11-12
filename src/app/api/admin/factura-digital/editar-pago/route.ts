import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { descontarSaldoFavor } from '@/lib/saldoFavor';

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
      fechaEmision,
      fechaAsignacion,
      fechaTransaccion,
      fechaPago,
      sinMulta,
      concepto,
      formasPago,
      usuario
    } = await req.json();

    if (!pagoId) {
      return NextResponse.json({ error: 'ID de pago requerido.' }, { status: 400 });
    }

    const u = String(usuario || 'Administrador').trim().toLowerCase();
    let cleanUser = u.includes('(') ? u.split('(')[1].replace(')', '').trim() : u;
    cleanUser = cleanUser.replace(/^[a-z]-/i, '').trim();
    const { data: trab } = await sb.from('trabajadores').select('usuario, rol').ilike('usuario', cleanUser).limit(1).maybeSingle();
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
    const nuevaRef = String(referencia || pago.referencia || '').replace(/\s*\(\+.*$/, '').trim() || String(pago.referencia || '').trim();
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
        const pctRaw = Number(det.factura_digital?.retencion?.porcentaje_retencion || det.porcentaje_retencion || det.retencion_porcentaje || 75);
        const pctRet = pctRaw > 0 && pctRaw <= 100 ? pctRaw : 75;
        const factorRet = pctRet / 100;
        const montoExento = Math.max(0, parseFloat(String(det.factura_digital?.retencion?.exento ?? det.factura_digital?.monto_exento ?? det.monto_exento ?? (sinMulta === true ? 0 : (det.multa_bs ?? 0)))) || 0);
        const montoGravableNeto = Math.max(0, nuevoMonto - montoExento);
        const divisor = 1 + 0.16 * (1 - factorRet);
        const base = parseFloat((montoGravableNeto / divisor).toFixed(2));
        const iva = parseFloat((base * 0.16).toFixed(2));
        const retencion = parseFloat((iva * factorRet).toFixed(2));
        const totalFactura = parseFloat((base + iva + montoExento).toFixed(2));
        return {
          monto_factura: totalFactura,
          monto_retencion_iva: retencion,
          retencion_iva: retencion,
          porcentaje_retencion: pctRet,
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
        saldo_favor: 0,
        saldo_a_favor_nuevo: 0,
        monto_sobrante: 0,
        saldo_favor_generado: 0,
        saldo_favor_bs: 0,
        monto_saldo_favor: 0,
        saldo_favor_acreditado: false,
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

    const fechaEmisionClean = [fechaEmision, fecha].find(f => f && /^\d{4}-\d{2}-\d{2}$/.test(String(f).trim()))?.trim();
    if (fechaEmisionClean) {
      const [yyyy, mm, dd] = fechaEmisionClean.split('-');
      const ddmmyyyy = `${dd}/${mm}/${yyyy}`;
      const isoCaracas = `${fechaEmisionClean}T12:00:00-04:00`;

      nuevosDetalles.fecha_emision_override = fechaEmisionClean;
      // Preservar siempre la fecha original del movimiento bancario / pago para que no se sobreescriba con la fecha de emisión
      if (!nuevosDetalles.fecha_transaccion && pago.created_at) {
        nuevosDetalles.fecha_transaccion = String(pago.created_at).slice(0, 10);
      }

      if (nuevosDetalles.factura_digital && typeof nuevosDetalles.factura_digital === 'object') {
        nuevosDetalles.factura_digital = {
          ...nuevosDetalles.factura_digital,
          fecha_emision: isoCaracas,
        };
        if (nuevosDetalles.factura_digital.raw_response?.resultado) {
          nuevosDetalles.factura_digital.raw_response = {
            ...nuevosDetalles.factura_digital.raw_response,
            resultado: {
              ...nuevosDetalles.factura_digital.raw_response.resultado,
              fechaEmision: ddmmyyyy,
            }
          };
        }
        if (nuevosDetalles.factura_digital.payload_generado?.documentoElectronico?.Encabezado?.IdentificacionDocumento) {
          nuevosDetalles.factura_digital.payload_generado.documentoElectronico.Encabezado.IdentificacionDocumento.FechaEmision = ddmmyyyy;
          nuevosDetalles.factura_digital.payload_generado.documentoElectronico.Encabezado.IdentificacionDocumento.FechaVencimiento = ddmmyyyy;
        }
      }
    }

    const fechaPagoClean = [fechaTransaccion, fechaPago].find(f => f && /^\d{4}-\d{2}-\d{2}$/.test(String(f).trim()))?.trim();
    if (fechaPagoClean) {
      nuevosDetalles.fecha_transaccion = fechaPagoClean;
      nuevosDetalles.fecha_pago_override = fechaPagoClean;
      nuevosDetalles.fecha_banco = fechaPagoClean;
      if (Array.isArray(nuevosDetalles.formasPago) && nuevosDetalles.formasPago.length === 1 && nuevosDetalles.formasPago[0]) {
        nuevosDetalles.formasPago[0] = {
          ...nuevosDetalles.formasPago[0],
          fecha: fechaPagoClean
        };
      }
    }

    if (sinMulta === true) {
      nuevosDetalles.sin_multas = true;
      nuevosDetalles.llevaMulta = false;
      nuevosDetalles.incluir_multas = false;
      nuevosDetalles.multa_bs = 0;
      nuevosDetalles.montoMulta = 0;
      nuevosDetalles.monto_multa = 0;
      if (Array.isArray(nuevosDetalles.recibos)) {
        nuevosDetalles.recibos = nuevosDetalles.recibos.filter((r: any) => !/^MULTA-/i.test(String(r)));
      }
      if (nuevosDetalles.montos && typeof nuevosDetalles.montos === 'object') {
        for (const k of Object.keys(nuevosDetalles.montos)) {
          if (/^MULTA-/i.test(k) || k.toLowerCase() === 'multa') {
            delete nuevosDetalles.montos[k];
          }
        }
      }
      if (Array.isArray(nuevosDetalles.deuda_previa)) {
        nuevosDetalles.deuda_previa = nuevosDetalles.deuda_previa.map((dp: any) => dp ? { ...dp, multa_bs: 0 } : dp);
      }
      if (Array.isArray(nuevosDetalles.condominio?.lineas)) {
        nuevosDetalles.condominio.lineas = nuevosDetalles.condominio.lineas.map((l: any) => l ? { ...l, multaBs: 0 } : l);
      }
      if (Array.isArray(nuevosDetalles.recibo_caja)) {
        nuevosDetalles.recibo_caja = nuevosDetalles.recibo_caja.map((rc: any) => {
          if (!rc) return rc;
          return {
            ...rc,
            exento: 0,
            conceptos: Array.isArray(rc.conceptos)
              ? rc.conceptos.filter((c: any) => !/multa|mora|sanci[oó]n/i.test(String(c?.descripcion || c?.concepto || '')))
              : rc.conceptos
          };
        });
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

    // Si se envían formasPago editadas (ej. pago múltiple con Débito + Transferencia), persistirlas
    if (Array.isArray(formasPago) && formasPago.length > 0) {
      const normalizedFps = formasPago.map((fp: any) => ({
        descripcion: String(fp?.descripcion || fp?.tipo || fp?.metodo || 'Transferencia').trim(),
        tipo: String(fp?.tipo || fp?.descripcion || fp?.metodo || 'Transferencia').trim(),
        metodo: String(fp?.metodo || fp?.descripcion || fp?.tipo || 'Transferencia').trim(),
        banco: String(fp?.banco || '').trim(),
        referencia: String(fp?.referencia || '').trim(),
        fecha: fp?.fecha || det.fecha_transaccion || det.fecha_banco || pago.created_at,
        monto: Math.round(((parseFloat(String(fp?.monto ?? 0).replace(',', '.')) || 0) + Number.EPSILON) * 100) / 100,
      })).filter((fp: any) => fp.monto > 0);

      if (normalizedFps.length > 0) {
        nuevosDetalles.formasPago = normalizedFps;
        nuevosDetalles.pagos_agregados = normalizedFps.map((fp: any) => ({
          tipo: fp.tipo,
          metodo: fp.metodo,
          descripcion: fp.descripcion,
          banco: fp.banco,
          referencia: fp.referencia,
          fecha: String(fp.fecha || '').slice(0, 10),
          monto: fp.monto,
        }));
      }
    } else if (montoCambio) {
      // Actualizar monto pagado en formasPago y monto_conciliado si el monto fue modificado expresamente
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
    };

    const { error: upErr } = await sb.from('pagos_reportados').update(updatePayload).eq('id', pagoId);
    if (upErr) {
      return NextResponse.json({ error: 'Error al actualizar pago: ' + upErr.message }, { status: 500 });
    }

    if (marcarAnulada) {
      try {
        const rawIdent = String(nuevaIdentidad || pago.identidad || det.identidad || '').trim().toUpperCase();
        const sinG = rawIdent.replace(/-/g, '');
        const conG = /^[VEJPG]\d/.test(sinG) ? `${sinG[0]}-${sinG.slice(1)}` : rawIdent;
        const identVariants = Array.from(new Set([rawIdent, sinG, conG].filter(Boolean)));
        const ident = conG || rawIdent;
        const codCondo = String(det.codigo_condominio || det.condominio?.codigo || det.cod_inmueble || '').trim().toUpperCase() || undefined;

        const addRefTokens = (set: Set<string>, val: any) => {
          const s = String(val || '').trim();
          if (!s) return;
          set.add(s);
          const sinRech = s.replace(/^RECH-/i, '').replace(/-[0-9a-f]{6}$/i, '').trim();
          if (sinRech) set.add(sinRech);
          const baseSinPlus = sinRech.replace(/\s*\(\+[^)]*\)/g, '').trim();
          if (baseSinPlus) set.add(baseSinPlus);
          const plusMatches = sinRech.matchAll(/\(\+\s*([^)]+)\)/g);
          for (const m of plusMatches) {
            if (m[1]) m[1].split(/[,\s+]+/).map(x => x.trim()).filter(Boolean).forEach(x => set.add(x));
          }
        };

        const refsToCheck = new Set<string>([String(pagoId)]);
        addRefTokens(refsToCheck, pago.referencia);
        addRefTokens(refsToCheck, nuevaRef);
        addRefTokens(refsToCheck, det.referencia);
        addRefTokens(refsToCheck, det.referencia_original);

        if (identVariants.length > 0) {
          const { data: docsNC } = await sb.from('documentos').select('*').eq('tipo', 'Nota de Credito').in('identidad', identVariants);
          const matchingDocs = (docsNC || []).filter((d: any) => {
            const raw = typeof d.detalles === 'string' ? d.detalles : JSON.stringify(d.detalles || {});
            return [...refsToCheck].some(r => r.length >= 4 && raw.includes(r));
          });
          for (const dNC of matchingDocs) {
            let dDet: any = {};
            try { dDet = typeof dNC.detalles === 'string' ? JSON.parse(dNC.detalles) : (dNC.detalles || {}); } catch {}
            const rawM = String(dDet.monto_bs ?? dDet.monto ?? 0);
            const mNC = (rawM.includes(',') ? parseFloat(rawM.replace(/\./g, '').replace(',', '.')) : parseFloat(rawM.replace(/[^\d.]/g, ''))) || 0;
            if (mNC > 0 && ident) {
              try { await descontarSaldoFavor(ident, mNC, codCondo, sb); } catch {}
            }
            await sb.from('documentos').delete().eq('id', dNC.id);
          }
        }
      } catch (eNC) {
        console.warn('Error eliminando nota de credito en editar-pago:', eNC);
      }
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
