import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { descontarSaldoFavor, acreditarSaldoFavor, restaurarSaldoFavorAplicado } from '@/lib/saldoFavor';

export const dynamic = 'force-dynamic';

// Candado en memoria para evitar condiciones de carrera (doble clic simultáneo sobre el mismo pagoId)
const inFlightPaymentIds = new Set<string>();

/**
 * ACTUALIZAR UN PAGO (servidor).
 * La base de datos NO permite que el navegador modifique `pagos_reportados` (solo leer e insertar): antes las
 * pantallas hacían el update desde el navegador y fallaba EN SILENCIO (p. ej. Conciliación aprobaba, bajaba la
 * deuda, pero el pago seguía "Por Verificar" y se podía aprobar otra vez → deuda descontada dos veces).
 *
 * Body: { pagoId, cambios: { estado?, banco?, tipo?, detalles?, created_at? }, usuario, soloSiEstado? }
 *  - soloSiEstado: el cambio solo se aplica si el pago sigue en ese estado (evita aprobar dos veces).
 *  Responde { ok: true } o { error } con 409 si el pago ya fue procesado.
 */
const PERMITIDOS = ['estado', 'banco', 'tipo', 'detalles', 'created_at', 'referencia', 'monto'] as const;
const ESTADOS = ['Aprobado', 'Rechazado', 'Por Verificar', 'Con Diferencia', 'Pendiente'];

export async function POST(req: Request) {
  let lockAcquiredId: string | null = null;
  try {
    const { pagoId, cambios, usuario, soloSiEstado } = await req.json();
    if (!pagoId || !cambios || typeof cambios !== 'object') return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });

    const pid = String(pagoId).trim();
    if (inFlightPaymentIds.has(pid)) {
      return NextResponse.json({ error: 'Este pago ya está siendo procesado en este momento. Espere unos segundos.' }, { status: 409 });
    }
    inFlightPaymentIds.add(pid);
    lockAcquiredId = pid;

    const u = String(usuario || '').trim();
    if (!u) return NextResponse.json({ error: 'Usuario no autorizado. Vuelva a iniciar sesión.' }, { status: 403 });
    let { data: trab } = await sb.from('trabajadores').select('usuario, nombre, estado').ilike('usuario', u).limit(1);
    if (!trab?.length) ({ data: trab } = await sb.from('trabajadores').select('usuario, nombre, estado').ilike('nombre', u).limit(1));
    const t = trab?.[0];
    if (!t || String(t.estado || 'Activo').toLowerCase() !== 'activo') return NextResponse.json({ error: 'Usuario no autorizado. Vuelva a iniciar sesión.' }, { status: 403 });

    const upd: Record<string, any> = {};
    for (const k of PERMITIDOS) if (k in cambios) upd[k] = cambios[k];
    if (!Object.keys(upd).length) return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 });
    if ('estado' in upd && !ESTADOS.includes(upd.estado)) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });

    // Verificar estado actual al principio para evitar ejecutar efectos secundarios si soloSiEstado no coincide
    const { data: actualP } = await sb.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
    if (!actualP) return NextResponse.json({ error: 'El pago no existe.' }, { status: 404 });
    if (soloSiEstado && actualP.estado !== soloSiEstado) {
      return NextResponse.json({ error: `Este pago ya fue procesado (estado actual: ${actualP.estado}). Recargue la página.`, estado: actualP.estado }, { status: 409 });
    }

    // Si se rechaza el pago, restaurar deuda del contribuyente y liberar referencia bancaria
    if (upd.estado === 'Rechazado') {
      if (actualP) {
        if (actualP.referencia && !actualP.referencia.startsWith('RECH-')) {
          upd.referencia = `RECH-${actualP.referencia}-${pagoId.slice(0, 6)}`;
        }
        const detP = typeof actualP.detalles === 'string' ? JSON.parse(actualP.detalles || '{}') : (actualP.detalles || {});
        let d = typeof upd.detalles === 'object' ? { ...detP, ...upd.detalles } : { ...detP };
        d.referencia_original = actualP.referencia;
        const fdPrevia = detP?.factura_digital;
        const teniaFacturaPrevia = Boolean(
          fdPrevia?.emitida ||
          fdPrevia?.anulada ||
          fdPrevia?.numero_documento ||
          fdPrevia?.numero_control ||
          fdPrevia?.nota_credito
        );
        if (teniaFacturaPrevia) {
          d.factura_digital = {
            ...fdPrevia,
            emitida: true,
            anulada: Boolean(fdPrevia?.anulada || fdPrevia?.nota_credito),
            rechazada: true,
            rechazada_at: new Date().toISOString(),
          };
        } else {
          d.factura_digital = { emitida: false, pendiente: false, rechazada: true, rechazada_at: new Date().toISOString() };
        }
        if (Array.isArray(detP?.facturas_digitales_previas) && detP.facturas_digitales_previas.length > 0) {
          d.facturas_digitales_previas = detP.facturas_digitales_previas;
        }
        d.saldo_favor = 0;
        d.saldo_a_favor_nuevo = 0;
        d.monto_sobrante = 0;
        d.saldo_favor_generado = 0;
        d.saldo_favor_bs = 0;
        d.monto_saldo_favor = 0;
        d.saldo_favor_acreditado = false;
        upd.detalles = d;

        // Determinar si el pago realmente había descontado deuda en inmuebles:
        // Si ya estaba Rechazado o ya tiene reverso_aplicado === true, NO volver a sumar la deuda.
        const detMerged = { ...detP, ...d };
        const yaReversado = actualP.estado === 'Rechazado' || detP.reverso_aplicado === true;
        const esCondoP = actualP.modulo === 'condominios' || Boolean(detP.es_condominio) || Boolean(detP.isCondominio) || detP.modulo === 'condominios';
        const pagoDescontoEnBD =
          actualP.estado === 'Aprobado' ||
          actualP.estado === 'Con Diferencia' ||
          Boolean(detP.fecha_conciliado) ||
          Boolean(detP.cajero || detP.caja) ||
          (esCondoP && (detP.deuda_condo_aplicada === true || (actualP.estado !== 'Por Verificar' && detP.deuda_condo_aplicada !== false)));
        const habiaDescontadoDeuda = !yaReversado;

        // SIEMPRE desbloquear facturas, convenios y servicios especiales que estaban 'Por Verificar' / 'En Revisión'
        const recibos: string[] = Array.isArray(detMerged.recibos) ? detMerged.recibos : [];
        if (recibos.length > 0) {
          await sb.from('facturas').update({ estado: 'Pendiente' }).in('referencia', recibos);
        }
        if (Array.isArray(detMerged.recibosIds) && detMerged.recibosIds.length > 0) {
          await sb.from('facturas').update({ estado: 'Pendiente' }).in('id', detMerged.recibosIds);
        }
        if (Array.isArray(detMerged.cuotas) && detMerged.cuotas.length > 0) {
          await sb.from('convenios_cuotas').update({ estado: 'Pendiente' }).in('id', detMerged.cuotas.map((c: any) => typeof c === 'object' ? (c.cuotaId || c.id) : c).filter(Boolean));
        }
        if (Array.isArray(detMerged.conveniosIds) && detMerged.conveniosIds.length > 0) {
          await sb.from('convenios_pago').update({ estado: 'Al Día' }).in('id', detMerged.conveniosIds);
        }
        if (Array.isArray(detMerged.servicios) && detMerged.servicios.length > 0) {
          await sb.from('servicios_especiales').update({ estado: 'Pendiente' }).in('referencia', detMerged.servicios.map((s: any) => typeof s === 'string' ? s : s.referencia).filter(Boolean));
        }
        if (Array.isArray(detMerged.tala_poda) && detMerged.tala_poda.length > 0) {
          await sb.from('servicios_especiales').update({ estado: 'Pendiente' }).in('referencia', detMerged.tala_poda.map((s: any) => typeof s === 'string' ? s : s.referencia).filter(Boolean));
        }

        // Rechazar comprobantes de retención vinculados (tanto JSONB directo como JSON serializado en string)
        await sb.from('pagos_reportados').update({ estado: 'Rechazado' }).filter('detalles->>pago_vinculado', 'eq', pagoId);
        if (actualP.identidad) {
          const { data: retCandidatos } = await sb
            .from('pagos_reportados')
            .select('id, detalles, estado')
            .eq('identidad', actualP.identidad)
            .ilike('referencia', 'RET-%')
            .neq('estado', 'Rechazado');
          const idsRetRechazar = (retCandidatos || [])
            .filter((r: any) => String(typeof r.detalles === 'string' ? r.detalles : JSON.stringify(r.detalles || {})).includes(pagoId))
            .map((r: any) => r.id);
          if (idsRetRechazar.length > 0) {
            await sb.from('pagos_reportados').update({ estado: 'Rechazado' }).in('id', idsRetRechazar);
          }
        }

        const codsInmRestaurados = new Set<string>();
        let teniaSnapshotSaldo = false;
        let prevListaRestauradaCount = 0;

        if (habiaDescontadoDeuda) {
          // Extraer primero los códigos de inmueble explícitamente afectados por ESTE pago
          const propCodesPago = new Set<string>();
          const addSplitCodesPago = (val: any) => {
            if (!val) return;
            String(val).split(/[,;\s]+/).forEach(tok => {
              const clean = tok.replace(/[^A-Z0-9_-]/gi, '').trim().toUpperCase();
              if (clean && /^(?:URB|AURI|CONDO)/i.test(clean)) propCodesPago.add(clean);
            });
          };
          recibos.forEach((r: string) => {
            const m = String(r).match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+?)(?:-M\d+)?$/i);
            if (m && m[1]) propCodesPago.add(m[1].toUpperCase());
            const mDir = String(r).match(/(URB\d+|AURI\d+)/i);
            if (mDir && mDir[1]) propCodesPago.add(mDir[1].toUpperCase());
          });
          addSplitCodesPago(detMerged.cod_inmueble);
          addSplitCodesPago(detMerged.codigo_inmueble);
          addSplitCodesPago(detMerged.inmueble);
          addSplitCodesPago(actualP.cod_inmueble);
          if (Array.isArray(detMerged.inmuebles)) {
            detMerged.inmuebles.forEach((ic: any) => {
              if (typeof ic === 'string') addSplitCodesPago(ic);
              else if (ic?.inmueble) addSplitCodesPago(ic.inmueble);
            });
          }
          if (detMerged.recibo_caja) {
            const rcArr = Array.isArray(detMerged.recibo_caja) ? detMerged.recibo_caja : [detMerged.recibo_caja];
            rcArr.forEach((rc: any) => {
              if (rc?.codContribuyente) addSplitCodesPago(rc.codContribuyente);
              if (rc?.inmueble) addSplitCodesPago(rc.inmueble);
            });
          }

          const prevListaRaw = Array.isArray(detP.deuda_previa) && detP.deuda_previa.length > 0
            ? detP.deuda_previa
            : (Array.isArray(detMerged.deuda_previa) && detMerged.deuda_previa.length > 0 ? detMerged.deuda_previa : []);

          // CRÍTICO: Si el pago especifica inmuebles (propCodesPago.size > 0), filtrar deuda_previa
          // para restaurar ÚNICAMENTE los inmuebles de este pago y NUNCA sobreescribir otros inmuebles del mismo RIF
          const prevLista = propCodesPago.size > 0
            ? prevListaRaw.filter((prev: any) => {
                if (prev?.unidad || prev?.condominio) return true;
                const cod = String(prev?.inmueble || '').trim().toUpperCase();
                return cod && propCodesPago.has(cod);
              })
            : prevListaRaw;

          prevListaRestauradaCount = prevLista.length;
          teniaSnapshotSaldo = prevLista.some((p: any) => p && (p.saldo_favor_bs !== undefined || p.abono_bs !== undefined));
          const usoSaldoFavorEnPago = (parseFloat(String(detMerged.saldo_usado || detMerged.descuentoSaldoFavor || 0)) || 0) > 0.01;
          const padresNAAfectados = new Set<string>();

          if (prevLista.length > 0) {
            for (const prev of prevLista) {
              if (prev.unidad) {
                await sb.from('condominio_unidades').update({
                  aseo_pendiente_desde: prev.aseo_pendiente_desde,
                  multa_meses: prev.multa_meses || 0,
                  multa_exonerada_hasta: prev.multa_exonerada_hasta || null,
                }).eq('id', prev.unidad);
              }
              if (prev.condominio) {
                await sb.from('condominios').update({
                  aseo_pendiente_desde: prev.aseo_pendiente_desde,
                  multa_meses: prev.multa_meses || 0,
                }).eq('id', prev.condominio);
              }
              if (prev.id || (prev.inmueble && prev.meses_deuda !== undefined)) {
                let curInm: any = null;
                if (prev.id) {
                  const { data } = await sb.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs, mmv_mes, padre_id, notas').eq('id', prev.id).maybeSingle();
                  curInm = data;
                } else if (prev.inmueble) {
                  const { data } = await sb.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs, mmv_mes, padre_id, notas').eq('inmueble', prev.inmueble).maybeSingle();
                  curInm = data;
                }
                const prevMeses = Math.max(0, parseInt(String(prev.meses_deuda ?? 0), 10) || 0);
                const curMeses = Math.max(0, parseInt(String(curInm?.meses_deuda ?? 0), 10) || 0);

                // Determinar cuántos meses cancelaba este pago específico para este inmueble
                const targetCod = String(prev.inmueble || curInm?.inmueble || '').toUpperCase();
                const mesesPagadosEnEstePago = recibos.filter((r: string) => {
                  const m = String(r).match(/(?:RECIB-HIST|CM)-([A-Z0-9_-]+?)(?:-M\d+)?$/i);
                  const cod = m?.[1]?.toUpperCase();
                  return cod && cod === targetCod;
                }).length || prevMeses || 1;

                // Detectar si el pago rechazado corresponde a un ciclo de facturación anterior (ej. septiembre 2026)
                const mesActualYmd = new Date().toISOString().slice(0, 7);
                const createdPagoYmd = String(actualP.created_at || detMerged.created_at_original || '').slice(0, 7);
                const perPagStr = String(detMerged.periodos_pagados || detMerged.periodos || '').toLowerCase();
                const pagoEsDeCicloAnterior = Boolean(
                  (createdPagoYmd && createdPagoYmd < mesActualYmd) ||
                  (perPagStr.includes('septiembre 2026') && !perPagStr.includes('octubre 2026'))
                );

                // Si el pago era de un ciclo anterior (ej. septiembre) y ya existe deuda del mes nuevo (ej. octubre, curMeses >= 1),
                // al rechazar el pago anterior se acumulan ambos meses (incluso cuando curMeses === prevMeses === 1)
                const nMeses = pagoEsDeCicloAnterior
                  ? (curMeses > 0 ? curMeses + mesesPagadosEnEstePago : Math.max(prevMeses, mesesPagadosEnEstePago))
                  : (pagoDescontoEnBD && curMeses < prevMeses
                      ? Math.max(prevMeses, curMeses + mesesPagadosEnEstePago)
                      : Math.max(prevMeses, curMeses, mesesPagadosEnEstePago));
                const mmvMes = parseFloat(String(curInm?.mmv_mes || 0)) || 0;
                const prevDeudaMmv = parseFloat(String(prev.deuda_mmv || 0)) || 0;
                const curDeudaMmv = parseFloat(String(curInm?.deuda_mmv || 0)) || 0;
                const nDeudaMmv = mmvMes > 0
                  ? parseFloat((nMeses * mmvMes).toFixed(6))
                  : Math.max(prevDeudaMmv, curDeudaMmv);

                const updInm: any = {
                  meses_deuda: nMeses,
                  deuda_mmv: nDeudaMmv,
                  multa_bs: Math.max(parseFloat(String(prev.multa_bs || 0)) || 0, parseFloat(String(curInm?.multa_bs || 0)) || 0),
                  deuda_congelada_bs: Math.max(parseFloat(String(prev.deuda_congelada_bs || 0)) || 0, parseFloat(String(curInm?.deuda_congelada_bs || 0)) || 0),
                };
                if (curInm?.notas && String(curInm.notas).includes('[PERIODOS_PENDIENTES:')) {
                  updInm.notas = String(curInm.notas)
                    .replace(/\s*\[PERIODOS_PENDIENTES:[^\]]*\]/gi, '')
                    .replace(/\s*\[PERIODOS_EXCLUIDOS:[^\]]*\]/gi, '')
                    .trim() || null;
                }
                if (usoSaldoFavorEnPago || prev.saldo_favor_bs !== undefined) {
                  updInm.saldo_favor_bs = parseFloat(String(prev.saldo_favor_bs || 0)) || 0;
                }
                if (prev.id) await sb.from('inmuebles').update(updInm).eq('id', prev.id);
                else if (prev.inmueble) await sb.from('inmuebles').update(updInm).eq('inmueble', prev.inmueble);
                if (prev.inmueble) codsInmRestaurados.add(String(prev.inmueble).toUpperCase());
                if (curInm?.padre_id) padresNAAfectados.add(String(curInm.padre_id).toUpperCase());
              } else if (prev.inmueble && prev.aseo_pendiente_desde) {
                // Pagos de condominio previos donde deuda_previa guardó aseo_pendiente_desde sin meses_deuda explícito
                const [yP, mP] = String(prev.aseo_pendiente_desde).slice(0, 7).split('-').map(Number);
                const hoyNow = new Date();
                const mesesCalc = (yP && mP)
                  ? Math.max(1, (hoyNow.getFullYear() - yP) * 12 + ((hoyNow.getMonth() + 1) - mP))
                  : 1;
                const { data: inmRow } = await sb.from('inmuebles').select('id, mmv_mes, deuda_mmv, meses_deuda, padre_id').eq('inmueble', prev.inmueble).limit(1).maybeSingle();
                if (inmRow) {
                  const curMeses = Math.max(0, parseInt(String(inmRow.meses_deuda ?? 0), 10) || 0);
                  const nMeses = Math.max(mesesCalc, curMeses);
                  const mmvMes = parseFloat(String(inmRow.mmv_mes || 0)) || 0;
                  await sb.from('inmuebles').update({
                    meses_deuda: nMeses,
                    ...(mmvMes > 0 ? { deuda_mmv: parseFloat((mmvMes * nMeses).toFixed(6)) } : {}),
                  }).eq('id', inmRow.id);
                  if (inmRow.padre_id) padresNAAfectados.add(String(inmRow.padre_id).toUpperCase());
                }
                codsInmRestaurados.add(String(prev.inmueble).toUpperCase());
              }
            }
          }

          // Fallback adicional: restaurar cualquier inmueble referenciado en recibos que no haya estado en prevLista
          // Si prevLista ya restauró los hijos del pago, NO incrementar por separado la matriz padre N/A en el fallback
          const esAbonoIncompletoSinDescuento = Boolean(
            detMerged.abono_completado &&
            detMerged.completado_con_pago_id &&
            !(Number(detMerged.abono_previo_descontado) > 0) &&
            !Array.isArray(detMerged.pagos_agregados)
          );
          if (prevLista.length === 0 && !esAbonoIncompletoSinDescuento) {
            const propCodes = new Set<string>(propCodesPago);
            // Excluir códigos ya restaurados mediante prevLista o que sean padres N/A ya cubiertos
            codsInmRestaurados.forEach(c => propCodes.delete(c));
            padresNAAfectados.forEach(c => propCodes.delete(c));

            if (prevLista.length === 0 || propCodes.size > 0) {
              const rawId = String(actualP.identidad || '').replace(/[,()]/g, '').trim().toUpperCase();
              const sinG = rawId.replace(/-/g, '');
              const conG = /^[VEJPG]\d/.test(sinG) ? `${sinG[0]}-${sinG.slice(1)}` : rawId;
              const idVars = [...new Set([rawId, sinG, conG].filter(Boolean))];
              
              const orConditions = [
                ...(prevLista.length === 0 && propCodes.size === 0 ? idVars.map(v => `identidad.eq.${v}`) : []),
                ...Array.from(propCodes).map(c => String(c || '').replace(/[,()]/g, '').trim()).filter(Boolean).map(c => `inmueble.eq.${c}`)
              ].filter(Boolean);

              if (orConditions.length > 0) {
                const { data: inmsAfectados } = await sb.from('inmuebles').select('*').or(orConditions.join(','));
                if (inmsAfectados && inmsAfectados.length > 0) {
                  for (const inm of inmsAfectados) {
                    if (inm.inmueble && codsInmRestaurados.has(String(inm.inmueble).toUpperCase())) continue;
                    if (inm.inmueble) {
                      const codU = String(inm.inmueble).trim().toUpperCase();
                      const { data: otrosAprobados } = await sb
                        .from('pagos_reportados')
                        .select('id, created_at, detalles')
                        .eq('estado', 'Aprobado')
                        .neq('id', actualP.id)
                        .gte('created_at', actualP.created_at || '2026-10-01');
                      const yaPagadoEnOtro = (otrosAprobados || []).some((op: any) => {
                        const dStr = typeof op.detalles === 'string' ? op.detalles : JSON.stringify(op.detalles || {});
                        return dStr.toUpperCase().includes(codU);
                      });
                      if (yaPagadoEnOtro) continue;
                    }
                    const mesesPagados = recibos.filter((r: string) => r.toUpperCase().includes(String(inm.inmueble || '').toUpperCase())).length || 1;
                    const curMeses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
                    const nuevoMeses = curMeses + mesesPagados;
                    const mmv = parseFloat(String(inm.mmv_mes || 0)) || (parseFloat(String(inm.deuda_mmv || 0)) / (curMeses || 1)) || 0;
                    await sb.from('inmuebles').update({
                      meses_deuda: nuevoMeses,
                      deuda_mmv: parseFloat((mmv * nuevoMeses).toFixed(6)),
                    }).eq('id', inm.id);
                    if (inm.padre_id) padresNAAfectados.add(String(inm.padre_id).toUpperCase());
                  }
                }
              }

              // Condominios: retroceder fecha de aseo SOLO si realmente descontó en BD, no había prevLista,
              // y únicamente sobre las unidades específicas del pago (nunca masivamente en condominios por actividad/comerciales)
              const esCondo = actualP.modulo === 'condominios' || detMerged.es_condominio || detMerged.modulo === 'condominios';
              if (esCondo && prevLista.length === 0 && pagoDescontoEnBD) {
                const lineasCondo: any[] = Array.isArray(detMerged.condominio?.lineas) ? detMerged.condominio.lineas : [];
                const unidadIdsAfectadas = lineasCondo.map((l: any) => l?.unidad_id).filter(Boolean);
                const codsUnidadesAfectadas = [
                  ...lineasCondo.map((l: any) => String(l?.inmueble || '').trim().toUpperCase()).filter(Boolean),
                  ...Array.from(propCodes).map(c => String(c || '').trim().toUpperCase()).filter(Boolean),
                ];
                const condoCod = detMerged.condominio?.codigo || detMerged.codigo_condominio || (Array.from(propCodes)[0]);
                const esPagoIndividual = detMerged.modo === 'CONTRIBUYENTE' || detMerged.condominio?.modo === 'CONTRIBUYENTE' || unidadIdsAfectadas.length > 0;

                if (condoCod) {
                  const { data: cRow } = await sb.from('condominios').select('*').eq('codigo', condoCod).limit(1).maybeSingle();
                  const esPorActividad = cRow && (cRow.modalidad === 'POR_ACTIVIDAD' || (!cRow.modalidad && cRow.tipo === 'Comercial'));
                  if (cRow && cRow.aseo_pendiente_desde && !esPorActividad && !esPagoIndividual) {
                    const mesesARevertir = recibos.length > 0 ? recibos.length : (detMerged.meses || 1);
                    const f = new Date(cRow.aseo_pendiente_desde + 'T12:00:00Z');
                    f.setMonth(f.getMonth() - mesesARevertir);
                    const nuevaFecha = f.toISOString().slice(0, 10);
                    await sb.from('condominios').update({ aseo_pendiente_desde: nuevaFecha }).eq('id', cRow.id);
                    await sb.from('condominio_unidades').update({ aseo_pendiente_desde: nuevaFecha }).eq('condominio_id', cRow.id);
                  } else if (codsUnidadesAfectadas.length > 0) {
                    // Sincronizar condominio_unidades.aseo_pendiente_desde únicamente para las unidades específicas restauradas desde inmuebles
                    const { data: inmsSync } = await sb.from('inmuebles').select('inmueble, meses_deuda').in('inmueble', codsUnidadesAfectadas);
                    for (const iSync of inmsSync || []) {
                      const mSync = Math.max(0, parseInt(String(iSync.meses_deuda ?? 0), 10) || 0);
                      let nuevaFechaU: string | null = null;
                      if (mSync > 0) {
                        let yS = 2026;
                        let moS = 10 - (mSync - 1);
                        while (moS <= 0) { moS += 12; yS -= 1; }
                        nuevaFechaU = `${yS}-${String(moS).padStart(2, '0')}-01`;
                      }
                      await sb.from('condominio_unidades').update({ aseo_pendiente_desde: nuevaFechaU }).eq('inmueble', iSync.inmueble);
                    }
                  }
                }
              }
            }
          }

          // Sincronizar padres N/A si alguno de sus hijos fue restaurado
          if (padresNAAfectados.size > 0) {
            for (const pCod of padresNAAfectados) {
              const { data: hermanosNA } = await sb
                .from('inmuebles')
                .select('meses_deuda, deuda_mmv')
                .eq('padre_id', pCod)
                .neq('estado', 'Eliminado');
              if (hermanosNA && hermanosNA.length > 0) {
                const maxMesesH = hermanosNA.reduce((m, h: any) => Math.max(m, parseInt(String(h.meses_deuda || 0), 10) || 0), 0);
                const { data: parentRow } = await sb.from('inmuebles').select('id, meses_deuda, mmv_mes').eq('inmueble', pCod).maybeSingle();
                if (parentRow) {
                  const finalParentMeses = maxMesesH;
                  const pMmvMes = parseFloat(String(parentRow.mmv_mes || 0)) || 0;
                  await sb.from('inmuebles').update({
                    meses_deuda: finalParentMeses,
                    ...(pMmvMes > 0 ? { deuda_mmv: parseFloat((finalParentMeses * pMmvMes).toFixed(6)) } : {}),
                  }).eq('id', parentRow.id);
                }
              }
            }
          }
        }

        if (!yaReversado) {
          // Limpiar movimientos de condominio
          await sb.from('condominio_movimientos').delete().in('pago_id', [pagoId, detMerged.pago_principal_id, detMerged.pago_vinculado].filter(Boolean));

          // Revertir y borrar/anular notas de crédito creadas por exceso o saldo a favor (incluso si el pago seguía en 'Por Verificar')
          try {
            const rawIdent = String(actualP.identidad || detMerged.identidad || '').trim().toUpperCase();
            const sinG = rawIdent.replace(/-/g, '');
            const conG = /^[VEJPG]\d/.test(sinG) ? `${sinG[0]}-${sinG.slice(1)}` : rawIdent;
            const extraIdents: string[] = [];
            if (Array.isArray(detMerged.condominio?.lineas)) {
              for (const lc of detMerged.condominio.lineas) {
                if (lc?.identidad) extraIdents.push(String(lc.identidad).trim().toUpperCase());
                if (lc?.inmueble) extraIdents.push(String(lc.inmueble).trim().toUpperCase());
              }
            }
            if (detMerged.cod_inmueble) extraIdents.push(String(detMerged.cod_inmueble).trim().toUpperCase());
            if (detMerged.codigo_inmueble) extraIdents.push(String(detMerged.codigo_inmueble).trim().toUpperCase());
            const identVariants = Array.from(new Set([rawIdent, sinG, conG, ...extraIdents].filter(Boolean)));
            const ident = conG || rawIdent;
            const codCondo = String(detMerged.codigo_condominio || detMerged.condominio?.codigo || detMerged.cod_inmueble || '').trim().toUpperCase() || undefined;

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
                if (m[1]) {
                  m[1].split(/[,\s+]+/).map(x => x.trim()).filter(Boolean).forEach(x => set.add(x));
                }
              }
            };

            const refsToCheck = new Set<string>();
            if (pagoId) refsToCheck.add(String(pagoId));
            addRefTokens(refsToCheck, actualP.referencia);
            addRefTokens(refsToCheck, detMerged.referencia);
            addRefTokens(refsToCheck, detMerged.referencia_original);
            addRefTokens(refsToCheck, detMerged.referencia_origen);
            if (Array.isArray(detMerged.formasPago)) {
              detMerged.formasPago.forEach((fp: any) => addRefTokens(refsToCheck, fp?.referencia));
            }
            if (Array.isArray(detMerged.pagos_agregados)) {
              detMerged.pagos_agregados.forEach((pa: any) => addRefTokens(refsToCheck, pa?.referencia));
            }

            let totalDescontadoDocs = 0;
            if (identVariants.length > 0) {
              const { data: docsNC } = await sb
                .from('documentos')
                .select('*')
                .eq('tipo', 'Nota de Credito')
                .in('identidad', identVariants);

              const validRefs = [...refsToCheck].filter(r => r && r.length >= 6 && !/^202\d$/.test(r));
              const matchingDocs = (docsNC || []).filter((d: any) => {
                let datos_json: any = {};
                try {
                  datos_json = typeof d.detalles === 'string' ? JSON.parse(d.detalles) : (d.detalles || d.datos_json || {});
                } catch {}
                if (pagoId && datos_json?.pago_id === pagoId) return true;
                const refCandidata = `${d.concepto || ''} ${datos_json?.referencia_pago || ''} ${datos_json?.origen_referencia || ''} ${datos_json?.referencia || ''}`;
                return validRefs.some(r => refCandidata.includes(r));
              });

              for (const dNC of matchingDocs) {
                let dDet: any = {};
                try {
                  dDet = typeof dNC.detalles === 'string' ? JSON.parse(dNC.detalles) : (dNC.detalles || {});
                } catch {}
                const rawM = String(dDet.monto_bs ?? dDet.monto ?? 0);
                const mNC = (rawM.includes(',') ? parseFloat(rawM.replace(/\./g, '').replace(',', '.')) : parseFloat(rawM.replace(/[^\d.]/g, ''))) || 0;
                const docCodInm = String(dDet.codigo_inmueble || codCondo || '').toUpperCase();
                const inmRestauradoPorSnapshot = docCodInm ? codsInmRestaurados.has(docCodInm) : teniaSnapshotSaldo;
                await sb.from('documentos').delete().eq('id', dNC.id);
                if (mNC > 0 && ident && !inmRestauradoPorSnapshot) {
                  try {
                    await descontarSaldoFavor(ident, mNC, docCodInm || codCondo, sb, true);
                    totalDescontadoDocs += mNC;
                  } catch (eDesc) {
                    console.warn('Error descontando saldo a favor en pagos/actualizar:', eDesc);
                  }
                } else if (mNC > 0 && inmRestauradoPorSnapshot) {
                  totalDescontadoDocs += mNC;
                }
              }
            }

            const excedentePrevio = parseFloat(String(
              detP?.saldo_a_favor_nuevo ||
              detP?.monto_sobrante ||
              detP?.saldo_favor ||
              detP?.saldo_favor_generado ||
              detP?.saldo_favor_bs ||
              detP?.monto_saldo_favor ||
              0
            )) || 0;
            if (excedentePrevio > totalDescontadoDocs + 0.05 && ident && !teniaSnapshotSaldo && (!habiaDescontadoDeuda || prevListaRestauradaCount === 0)) {
              const diffDesc = Math.round((excedentePrevio - totalDescontadoDocs) * 100) / 100;
              try {
                await descontarSaldoFavor(ident, diffDesc, codCondo, sb, true);
              } catch (eDesc) {
                console.warn('Error descontando excedente previo en pagos/actualizar:', eDesc);
              }
            }
          } catch(e) {}

          d.reverso_aplicado = true;
          d.deuda_condo_aplicada = false;
          upd.detalles = d;
        }

        // Si el pago rechazado había consumido Nota de Crédito / Saldo a Favor (ya sea desde Soy Contribuyente en 'Por Verificar' o desde Caja/Conciliación en 'Aprobado'),
        // restaurar el documento original en `documentos` de 'Aplicada' a 'Vigente' sin duplicar registros.
        const saldoUsadoEnPago = parseFloat(String(
          detP?.saldo_usado ??
          detP?.nota_credito_usada ??
          detP?.saldo_favor_usado ??
          detP?.descuentoSaldoFavor ??
          0
        )) || 0;
        if (!yaReversado && !detP?.nota_credito_restaurada && saldoUsadoEnPago > 0.01) {
          try {
            const rawIdentRest = String(actualP.identidad || detMerged.identidad || '').trim().toUpperCase();
            const sinGRest = rawIdentRest.replace(/-/g, '');
            const conGRest = /^[VEJPG]\d/.test(sinGRest) ? `${sinGRest[0]}-${sinGRest.slice(1)}` : rawIdentRest;
            const identRest = conGRest || rawIdentRest;
            const prevListaSnap = Array.isArray(detP?.deuda_previa) ? detP.deuda_previa : [];
            const yaRestauroInmSaldo = habiaDescontadoDeuda && prevListaSnap.some((p: any) => p && p.saldo_favor_bs !== undefined);

            const notasPorInm = detP?.notas_credito_por_inmueble && typeof detP.notas_credito_por_inmueble === 'object'
              ? detP.notas_credito_por_inmueble
              : null;
            const entriesInm = notasPorInm
              ? Object.entries(notasPorInm).filter(([, m]) => (parseFloat(String(m || 0)) || 0) > 0.01)
              : [];

            if (entriesInm.length > 0) {
              for (const [codInmKey, mVal] of entriesInm) {
                const mNum = Math.round((parseFloat(String(mVal || 0)) || 0) * 100) / 100;
                const codLimpio = String(codInmKey || '').trim().toUpperCase();
                if (mNum > 0 && identRest) {
                  await restaurarSaldoFavorAplicado(identRest, mNum, codLimpio || undefined, sb, yaRestauroInmSaldo);
                }
              }
            } else if (identRest) {
              const codUnico = String(
                detP?.codigo_condominio ||
                detP?.condominio?.codigo ||
                detP?.cod_inmueble ||
                detP?.codigo_inmueble ||
                actualP.cod_inmueble ||
                ''
              ).trim().toUpperCase() || undefined;
              await restaurarSaldoFavorAplicado(identRest, saldoUsadoEnPago, codUnico, sb, yaRestauroInmSaldo);
            }
            d.nota_credito_restaurada = true;
            upd.detalles = d;
          } catch (eRestNC) {
            console.warn('Error restaurando nota de crédito aplicada al rechazar pago:', eRestNC);
          }
        }
      }
    }

    // Si se aprueba un pago pendiente / por verificar (por ejemplo desde Estado de Cuenta, Conciliación o vía API):
    // NOTA: Incluso si cambios.skipServerDebtSync === true (enviado por Conciliación Bancaria para recibos ordinarios),
    // los pagos de Caja de Condominios que aún no tengan deuda_condo_aplicada SIEMPRE deben aplicar su descuento en el servidor.
    const detPrevCheck = typeof actualP?.detalles === 'string' ? JSON.parse(actualP.detalles || '{}') : (actualP?.detalles || {});
    const esCondoSinAplicar = Boolean(
      (actualP?.modulo === 'condominios' || detPrevCheck.modulo === 'condominios' || detPrevCheck.es_condominio || detPrevCheck.isCondominio) &&
      !detPrevCheck.deuda_condo_aplicada
    );
    if (actualP && actualP.estado === 'Aprobado' && (upd.estado === 'Aprobado' || !upd.estado)) {
      const detP = typeof actualP.detalles === 'string' ? JSON.parse(actualP.detalles || '{}') : (actualP.detalles || {});
      const d = typeof upd.detalles === 'object' ? { ...detP, ...upd.detalles } : { ...detP };
      const montoNuevoEdicion = parseFloat(String(upd.monto ?? actualP.monto ?? d.monto_conciliado ?? 0)) || 0;
      const montoDocEdicion = parseFloat(String(d.monto_factura || d.total_seleccionado || d.montoTotal || 0)) || 0;
      const montoRetEdicion = parseFloat(String(d.monto_retencion_iva || d.retencion_iva || 0)) || 0;
      const abonoPrevEdicion = parseFloat(String(d.abono_previo_descontado || 0)) || 0;
      let sfUsadoEdicion = parseFloat(String(d.saldo_usado || d.descuento_saldo_favor || d.saldo_favor_usado || 0)) || 0;
      if (sfUsadoEdicion <= 0 && Array.isArray(d.pagos_agregados)) {
        sfUsadoEdicion = d.pagos_agregados
          .filter((pa: any) => /saldo|nota de cr[eé]dito/i.test(String(pa?.metodo || pa?.tipo || pa?.referencia || '')))
          .reduce((acc: number, pa: any) => acc + (parseFloat(String(pa?.monto || 0)) || 0), 0);
      }
      if (sfUsadoEdicion <= 0 && Array.isArray(d.formasPago)) {
        sfUsadoEdicion = d.formasPago
          .filter((fp: any) => /saldo|nota de cr[eé]dito/i.test(String(fp?.descripcion || fp?.metodo || fp?.referencia || '')))
          .reduce((acc: number, fp: any) => acc + (parseFloat(String(fp?.monto || 0)) || 0), 0);
      }
      const deudaNetaEdicion = Math.max(0, Math.round((montoDocEdicion - montoRetEdicion - sfUsadoEdicion - abonoPrevEdicion) * 100) / 100);
      if (
        montoDocEdicion > 0 &&
        montoNuevoEdicion >= deudaNetaEdicion + 5.00 &&
        !detP.saldo_favor_acreditado &&
        !d.es_abono &&
        !d.es_pago_adicional &&
        !d.pago_vinculado &&
        actualP.tipo !== 'Retencion de IVA'
      ) {
        const excedenteEdicion = Math.round((montoNuevoEdicion - deudaNetaEdicion) * 100) / 100;
        const rawIdEd = String(actualP.identidad || '').trim().toUpperCase();
        const sinGEd = rawIdEd.replace(/-/g, '');
        const conGEd = /^[VEJPG]\d/.test(sinGEd) ? `${sinGEd[0]}-${sinGEd.slice(1)}` : rawIdEd;
        const codTargetEd = String(d.condominio?.codigo || d.codigo_condominio || d.codigo_inmueble || d.cod_inmueble || '').trim().toUpperCase() || undefined;
        const esCondoEd = actualP.modulo === 'condominios' || d.modulo === 'condominios' || d.es_condominio || d.isCondominio;
        const esModoCondoEd = esCondoEd && (d.condominio?.modo || d.modo) === 'CONDOMINIO';
        try {
          const { data: existNcEd } = await sb
            .from('documentos')
            .select('id')
            .eq('tipo', 'Nota de Credito')
            .eq('estado', 'Vigente')
            .ilike('detalles', `%${pagoId}%`)
            .limit(1);
          if (!existNcEd || existNcEd.length === 0) {
            await acreditarSaldoFavor(conGEd || rawIdEd, excedenteEdicion, codTargetEd, sb);
            await sb.from('documentos').insert([{
              identidad: conGEd || rawIdEd,
              contribuyente: d.contribuyente || d.contribuyente_nombre || conGEd || rawIdEd,
              tipo: 'Nota de Credito',
              estado: 'Vigente',
              detalles: JSON.stringify({
                monto: excedenteEdicion.toFixed(2),
                monto_bs: excedenteEdicion,
                ambito: esModoCondoEd ? 'CONDOMINIO' : (esCondoEd ? 'LOCAL' : 'CONTRIBUYENTE'),
                codigo_inmueble: codTargetEd,
                origen_referencia: `Excedente Pago Conciliado${codTargetEd ? ' ' + codTargetEd : ''}. Ref: ${upd.referencia || actualP.referencia || ''}`,
                motivo: `Nota de crédito automática por excedente de pago conciliado`,
                fecha_emision: new Date().toISOString(),
                pago_id: pagoId,
              }),
            }]);
            d.saldo_favor = excedenteEdicion;
            d.saldo_favor_generado = excedenteEdicion;
            d.saldo_a_favor_nuevo = excedenteEdicion;
            d.saldo_favor_acreditado = true;
            upd.detalles = d;
          }
        } catch (eEdNc) {
          console.warn('Error acreditando saldo a favor al editar monto conciliado:', eEdNc);
        }
      }
    }

    if (upd.estado === 'Aprobado' && (!cambios.skipServerDebtSync || esCondoSinAplicar)) {
      if (actualP && actualP.estado !== 'Aprobado') {
        const detP = typeof actualP.detalles === 'string' ? JSON.parse(actualP.detalles || '{}') : (actualP.detalles || {});
        const d = typeof upd.detalles === 'object' ? { ...detP, ...upd.detalles } : { ...detP };
        if (!d.fecha_conciliado) d.fecha_conciliado = new Date().toISOString();

        const recibos: string[] = Array.isArray(d.recibos) ? d.recibos : [];
        const rawId = String(actualP.identidad || '').trim().toUpperCase();
        const sinG = rawId.replace(/-/g, '');
        const conG = /^[VEJPG]\d/.test(sinG) ? `${sinG[0]}-${sinG.slice(1)}` : rawId;
        const idVars = [...new Set([rawId, sinG, conG].filter(Boolean))];

        const esCondo = actualP.modulo === 'condominios' || d.modulo === 'condominios' || d.es_condominio || d.isCondominio;

        if (esCondo && !detP.deuda_condo_aplicada) {
          const M = await import('@/lib/condominios/motor');
          const hoyMes = new Date();
          const condoInfo = d.condominio || {};
          const condoCod = String(condoInfo.codigo || d.codigo_condominio || d.cod_inmueble || '').trim().toUpperCase();
          const lineasCondo: any[] = Array.isArray(condoInfo.lineas) ? condoInfo.lineas : [];
          const soloMultas = Boolean(condoInfo.soloMultas || condoInfo.solo_multas || d.solo_multas || d.soloMultas);
          const incluirMultas = condoInfo.incluirMultas !== undefined
            ? Boolean(condoInfo.incluirMultas)
            : (d.incluir_multas !== undefined ? Boolean(d.incluir_multas) : !Boolean(d.sin_multas));
          const esModoCondo = (condoInfo.modo || d.modo) === 'CONDOMINIO';

          const { data: cRow } = condoCod
            ? await sb.from('condominios').select('*').eq('codigo', condoCod).limit(1).maybeSingle()
            : { data: null as any };

          for (const l of lineasCondo) {
            const mesesPagar = Number(l.mesesPagar ?? l.meses ?? 0) || 0;
            const uId = l.unidad_id && l.unidad_id !== M.SIN_REGISTRAR && l.unidad_id !== '__CONDOMINIO__' ? l.unidad_id : null;
            if (uId) {
              const { data: uRow } = await sb.from('condominio_unidades').select('*').eq('id', uId).maybeSingle();
              if (uRow) {
                const updU: any = {};
                const desdeActual = uRow.aseo_pendiente_desde || cRow?.aseo_pendiente_desde;
                const mesesRealesHoy = desdeActual ? M.mesesPendientes(desdeActual, hoyMes) : mesesPagar;
                const mesesRestantes = Math.max(0, mesesRealesHoy - mesesPagar);
                if (mesesPagar > 0 && !soloMultas) {
                  updU.aseo_pendiente_desde = M.avanzarPendiente(desdeActual, mesesPagar, hoyMes);
                }
                const pagoIncluyeMultaLinea = soloMultas || incluirMultas || (Number(l.multaBs) || 0) > 0.01;
                if (pagoIncluyeMultaLinea) {
                  updU.multa_meses = soloMultas ? 0 : Math.max(0, mesesRestantes - 1);
                  const periodosLinea: string[] = Array.isArray(l.periodos) ? l.periodos : [];
                  if (periodosLinea.length > 0) {
                    const ultPer = periodosLinea[periodosLinea.length - 1];
                    const curExo = String(uRow.multa_exonerada_hasta || '').slice(0, 7);
                    if (!curExo || ultPer > curExo) {
                      updU.multa_exonerada_hasta = `${ultPer}-01`;
                    }
                  }
                }
                if (Object.keys(updU).length > 0) {
                  await sb.from('condominio_unidades').update(updU).eq('id', uRow.id);
                }
                const codU = String(uRow.inmueble || l.inmueble || '').trim().toUpperCase();
                if (codU && mesesPagar > 0 && !soloMultas) {
                  const { data: curInm } = await sb.from('inmuebles').select('id, meses_deuda, deuda_mmv, mmv_mes, multa_bs').ilike('inmueble', codU).limit(1).maybeSingle();
                  if (curInm) {
                    const nMesesRest = Math.max(0, (parseInt(String(curInm.meses_deuda || 0)) || 0) - mesesPagar);
                    const tarifaMmvUnit = Number(uRow.tarifa_mmv || curInm.mmv_mes || 0) || 0;
                    await sb.from('inmuebles').update({
                      meses_deuda: nMesesRest,
                      deuda_mmv: nMesesRest === 0 ? 0 : (tarifaMmvUnit > 0 ? Math.round(nMesesRest * tarifaMmvUnit * 100) / 100 : (curInm.deuda_mmv || 0)),
                      ...(nMesesRest === 0 ? { deuda_congelada_bs: 0 } : {}),
                      multa_bs: (pagoIncluyeMultaLinea && nMesesRest <= 1) ? 0 : (curInm.multa_bs || 0),
                    }).eq('id', curInm.id);
                  }
                }
              }
            } else if (cRow && (l.unidad_id === M.SIN_REGISTRAR || l.unidad_id === '__CONDOMINIO__' || !l.unidad_id)) {
              const updC: any = {};
              if (mesesPagar > 0 && !soloMultas) {
                updC.aseo_pendiente_desde = M.avanzarPendiente(cRow.aseo_pendiente_desde, mesesPagar, hoyMes);
              }
              if (soloMultas || incluirMultas) {
                updC.multa_meses = 0;
              }
              if (Object.keys(updC).length > 0) {
                await sb.from('condominios').update(updC).eq('id', cRow.id);
              }
              if (cRow.codigo && mesesPagar > 0 && !soloMultas) {
                const { data: curInm } = await sb.from('inmuebles').select('id, meses_deuda, deuda_mmv').eq('inmueble', cRow.codigo).limit(1).maybeSingle();
                if (curInm) {
                  const nMesesRest = Math.max(0, (parseInt(String(curInm.meses_deuda || 0)) || 0) - mesesPagar);
                  await sb.from('inmuebles').update({
                    meses_deuda: nMesesRest,
                    deuda_mmv: nMesesRest === 0 ? 0 : curInm.deuda_mmv,
                    multa_bs: 0,
                  }).eq('id', curInm.id);
                }
              }
            }
          }

          if (cRow && esModoCondo && !soloMultas) {
            const maxMeses = lineasCondo.reduce((mx, l) => Math.max(mx, Number(l.mesesPagar ?? l.meses ?? 0) || 0), 0);
            if (maxMeses > 0 && cRow.aseo_pendiente_desde && !lineasCondo.some(l => l.unidad_id === M.SIN_REGISTRAR || l.unidad_id === '__CONDOMINIO__')) {
              const nuevoDesde = M.avanzarPendiente(cRow.aseo_pendiente_desde, maxMeses, hoyMes);
              await sb.from('condominios').update({ aseo_pendiente_desde: nuevoDesde, multa_meses: 0 }).eq('id', cRow.id);
            }
            const { data: condoActualizado } = await sb.from('condominios').select('aseo_pendiente_desde').eq('id', cRow.id).maybeSingle();
            const nuevoDesdeCondo = condoActualizado?.aseo_pendiente_desde ?? cRow.aseo_pendiente_desde;
            if (nuevoDesdeCondo) {
              await sb.from('condominio_unidades')
                .update({ aseo_pendiente_desde: nuevoDesdeCondo })
                .eq('condominio_id', cRow.id)
                .or('es_grupo.eq.true,actividad.eq.N/A,actividad.is.null');
            }
          }

          // Acreditar saldo a favor si la transferencia de condominio tenía excedente pendiente
          let sfCondo = parseFloat(String(d.saldo_favor || d.saldo_a_favor_nuevo || d.saldo_favor_generado || 0)) || 0;
          if (sfCondo <= 0) {
            const mTransf = parseFloat(String(cambios.monto ?? actualP.monto ?? d.monto_conciliado ?? 0)) || 0;
            const mDoc = parseFloat(String(d.monto_factura || d.total_seleccionado || d.montoTotal || 0)) || 0;
            const mRet = parseFloat(String(d.monto_retencion_iva || d.retencion_iva || 0)) || 0;
            let mSfUsado = parseFloat(String(d.saldo_usado || d.saldo_favor_usado || d.descuento_saldo_favor || 0)) || 0;
            if (mSfUsado <= 0 && Array.isArray(d.pagos_agregados)) {
              mSfUsado = d.pagos_agregados
                .filter((pa: any) => /saldo|nota de cr[eé]dito/i.test(String(pa?.metodo || pa?.tipo || pa?.referencia || '')))
                .reduce((acc: number, pa: any) => acc + (parseFloat(String(pa?.monto || 0)) || 0), 0);
            }
            const deudaNetaReq = Math.max(0, Math.round((mDoc - mRet - mSfUsado) * 100) / 100);
            if (mDoc > 0 && mTransf >= deudaNetaReq + 5.00) {
              sfCondo = Math.round((mTransf - deudaNetaReq) * 100) / 100;
              d.saldo_favor = sfCondo;
              d.saldo_favor_generado = sfCondo;
              d.saldo_a_favor_nuevo = sfCondo;
            }
          }
          if (sfCondo > 0 && sfCondo < 5.00) {
            d.saldo_favor = 0;
            d.saldo_favor_generado = 0;
          }
          if (sfCondo >= 5.00 && !detP.saldo_favor_acreditado && !d.es_pago_adicional && !d.pago_vinculado && actualP.tipo !== 'Retencion de IVA' && rawId) {
            const mGen = Math.round(sfCondo * 100) / 100;
            const codigoTargetSF = esModoCondo ? (condoCod || undefined) : (String(lineasCondo[0]?.inmueble || condoCod || '').trim().toUpperCase() || undefined);
            try {
              await acreditarSaldoFavor(rawId, mGen, codigoTargetSF, sb);
              await sb.from('documentos').insert([{
                identidad: rawId,
                contribuyente: d.contribuyente || cRow?.nombre || rawId,
                tipo: 'Nota de Credito',
                estado: 'Vigente',
                detalles: JSON.stringify({
                  monto: mGen.toFixed(2),
                  monto_bs: mGen,
                  ambito: esModoCondo ? 'CONDOMINIO' : 'LOCAL',
                  codigo_inmueble: codigoTargetSF,
                  codigo_condominio: condoCod || undefined,
                  origen_referencia: `Excedente Caja de Condominios ${condoCod || ''}. Ref: ${actualP.referencia || ''}`,
                  motivo: `Nota de crédito automática por excedente de pago (${condoCod || 'Condominio'})`,
                  fecha_emision: new Date().toISOString(),
                  pago_id: pagoId,
                }),
              }]);
              d.saldo_favor_acreditado = true;
            } catch (eSf) {
              console.warn('Error acreditando saldo a favor de condominio al aprobar:', eSf);
            }
          }

          d.deuda_condo_aplicada = true;
        }

        // Snapshot de deuda previa antes de descontar en inmuebles (si no es de condominios y no fue omitido por skipServerDebtSync)
        if (!esCondo && !cambios.skipServerDebtSync && idVars.length > 0) {
          const { data: inmsPrev } = await sb
            .from('inmuebles')
            .select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs')
            .in('identidad', idVars);
          if (inmsPrev && inmsPrev.length > 0) {
            if (!Array.isArray(d.deuda_previa) || d.deuda_previa.length === 0) {
              d.deuda_previa = inmsPrev;
            }
            const histRefs = recibos.filter(r => r.startsWith('RECIB-HIST-'));
            const multaRefs = recibos.filter(r => r.startsWith('MULTA-'));

            // Si este pago se reportó como abono parcial (es_abono: true), verificar si sumado a otros abonos
            // ya aprobados del mismo inmueble/recibo ya completa el monto_factura esperado.
            let abonoCompletadoAcumulado = false;
            if (d.es_abono && !d.abono_completado) {
              const montoFacturaEsp = parseFloat(String(d.monto_factura || d.total_seleccionado || 0)) || 0;
              const montoActualNum = parseFloat(String(actualP.monto || d.monto_conciliado || 0)) || 0;
              if (montoFacturaEsp > 0 && montoActualNum > 0) {
                const codInmActual = String(d.cod_inmueble || d.codigo_inmueble || d.inmueble || '').trim().toUpperCase();
                const { data: otrosAbonos } = await sb
                  .from('pagos_reportados')
                  .select('id, monto, detalles')
                  .eq('estado', 'Aprobado')
                  .neq('id', pagoId)
                  .or(idVars.map((v: string) => `detalles->>identidad.eq.${v}`).join(','));
                const abonosHermanos = (otrosAbonos || []).filter((op: any) => {
                  const detO = typeof op.detalles === 'string' ? JSON.parse(op.detalles || '{}') : (op.detalles || {});
                  if (!detO.es_abono || detO.abono_completado) return false;
                  const recsO: string[] = Array.isArray(detO.recibos) ? detO.recibos : [];
                  if (recibos.length > 0 && recsO.some((r: string) => recibos.includes(r))) return true;
                  const codO = String(detO.cod_inmueble || detO.codigo_inmueble || detO.inmueble || '').trim().toUpperCase();
                  return Boolean(codInmActual && codO && codInmActual === codO);
                });
                const sumaHermanos = abonosHermanos.reduce((s: number, op: any) => s + (parseFloat(String(op.monto || 0)) || 0), 0);
                if (montoActualNum + sumaHermanos >= montoFacturaEsp - 0.50) {
                  abonoCompletadoAcumulado = true;
                  d.abono_completado = true;
                  for (const op of abonosHermanos) {
                    const detO = typeof op.detalles === 'string' ? JSON.parse(op.detalles || '{}') : (op.detalles || {});
                    await sb.from('pagos_reportados').update({
                      detalles: { ...detO, abono_completado: true }
                    }).eq('id', op.id);
                  }
                }
              }
            }

            if ((!d.es_abono || abonoCompletadoAcumulado) && (histRefs.length > 0 || multaRefs.length > 0 || recibos.includes('RECIB-DEUDA'))) {
              for (const inm of inmsPrev) {
                const cod = String(inm.inmueble || '').toUpperCase();
                const histInm = histRefs.filter(r => r.toUpperCase().includes(`-${cod}-`));
                const multaInm = multaRefs.filter(r => r.toUpperCase().includes(`MULTA-${cod}`));
                const curMeses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));

                if (recibos.includes('RECIB-DEUDA') || (histInm.length >= curMeses && histInm.length > 0)) {
                  await sb.from('inmuebles').update({ meses_deuda: 0, deuda_mmv: 0, multa_bs: 0, deuda_congelada_bs: 0 }).eq('id', inm.id);
                  if (cod) {
                    await sb.from('condominio_unidades').update({ aseo_pendiente_desde: null, multa_meses: 0 }).ilike('inmueble', cod);
                  }
                } else if (histInm.length > 0) {
                  const nuevoMeses = Math.max(0, curMeses - histInm.length);
                  const dMmv = parseFloat(String(inm.deuda_mmv || 0));
                  const mBs = parseFloat(String(inm.multa_bs || 0));
                  const nuevaMulta = multaInm.length > 0 ? 0 : (nuevoMeses === 0 ? 0 : parseFloat(((mBs * nuevoMeses) / (curMeses || 1)).toFixed(2)));
                  await sb.from('inmuebles').update({
                    meses_deuda: nuevoMeses,
                    deuda_mmv: nuevoMeses === 0 ? 0 : parseFloat(((dMmv * nuevoMeses) / (curMeses || 1)).toFixed(6)),
                    multa_bs: nuevaMulta,
                    ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                  }).eq('id', inm.id);
                  if (cod) {
                    const { pendienteDesdeParaMeses } = await import('@/lib/condominios/motor');
                    await sb.from('condominio_unidades').update({
                      aseo_pendiente_desde: pendienteDesdeParaMeses(nuevoMeses),
                      ...(nuevaMulta <= 0.01 ? { multa_meses: Math.max(0, nuevoMeses - 1) } : {})
                    }).ilike('inmueble', cod);
                  }
                } else if (multaInm.length > 0) {
                  await sb.from('inmuebles').update({ multa_bs: 0, deuda_congelada_bs: 0 }).eq('id', inm.id);
                  if (cod) {
                    await sb.from('condominio_unidades').update({ multa_meses: 0 }).ilike('inmueble', cod);
                  }
                }
              }
            }
          }

          // Acreditar saldo a favor si el pago general (o con retención 75% IVA) tenía excedente no acreditado
          if (!detP.saldo_favor_acreditado && rawId && !d.es_abono) {
            const montoPagadoNum = parseFloat(String(actualP.monto || d.monto_conciliado || 0)) || 0;
            const montoFacNum = parseFloat(String(d.monto_factura || d.total_seleccionado || 0)) || 0;
            const montoRetNum = parseFloat(String(d.monto_retencion_iva || d.retencion_iva || 0)) || 0;
            const abonoPrevNum = parseFloat(String(d.abono_previo_descontado || 0)) || 0;
            const sfUsadoNum = parseFloat(String(d.saldo_usado || d.descuento_saldo_favor || d.saldo_favor_usado || 0)) || 0;
            const sfExplicitoRaw = parseFloat(String(d.saldo_a_favor_nuevo || d.saldo_favor_generado || d.monto_sobrante || d.saldo_favor || 0)) || 0;
            const esFalsoSfRetencion = montoRetNum > 0 && Math.abs(sfExplicitoRaw - montoRetNum) < 2.00 && Math.abs((montoPagadoNum + montoRetNum + abonoPrevNum + sfUsadoNum) - montoFacNum) < 5.00;
            const esFalsoSfAbono = abonoPrevNum > 0 && Math.abs(sfExplicitoRaw - abonoPrevNum) < 2.00 && Math.abs((montoPagadoNum + montoRetNum + abonoPrevNum + sfUsadoNum) - montoFacNum) < 5.00;
            const sfExplicito = (esFalsoSfRetencion || esFalsoSfAbono) ? 0 : sfExplicitoRaw;
            const sfCalculadoRet = (montoFacNum > 0 && montoPagadoNum > 0 && (montoPagadoNum + abonoPrevNum + sfUsadoNum) > (montoFacNum - montoRetNum) + 5.00)
              ? Math.round(((montoPagadoNum + abonoPrevNum + sfUsadoNum) - (montoFacNum - montoRetNum)) * 100) / 100
              : 0;
            const sfGeneral = Math.max(sfExplicito >= 5.00 ? sfExplicito : 0, sfCalculadoRet);
            if (sfGeneral < 5.00 && sfExplicitoRaw > 0) {
              d.saldo_favor = 0;
              d.saldo_a_favor_nuevo = 0;
              d.saldo_favor_generado = 0;
              d.monto_sobrante = 0;
            }
            if (sfGeneral >= 5.00 && !d.es_abono && !d.es_pago_adicional && !d.pago_vinculado && actualP.tipo !== 'Retencion de IVA') {
              const mGen = Math.round(sfGeneral * 100) / 100;
              const codTargetGen = String(d.codigo_inmueble || d.cod_inmueble || inmsPrev?.[0]?.inmueble || '').trim().toUpperCase() || undefined;
              try {
                await acreditarSaldoFavor(conG || rawId, mGen, codTargetGen, sb);
                await sb.from('documentos').insert([{
                  identidad: conG || rawId,
                  contribuyente: d.contribuyente || d.contribuyente_nombre || conG || rawId,
                  tipo: 'Nota de Credito',
                  estado: 'Vigente',
                  detalles: JSON.stringify({
                    monto: mGen.toFixed(2),
                    monto_bs: mGen,
                    ambito: 'CONTRIBUYENTE',
                    codigo_inmueble: codTargetGen,
                    origen_referencia: `Excedente Pago Conciliado${codTargetGen ? ' ' + codTargetGen : ''}. Ref: ${actualP.referencia || ''}`,
                    motivo: `Nota de crédito automática por excedente de pago conciliado${montoRetNum > 0 ? ' (tras aplicar Retención IVA)' : ''}`,
                    fecha_emision: new Date().toISOString(),
                    pago_id: pagoId,
                  }),
                }]);
                d.saldo_favor = mGen;
                d.saldo_favor_generado = mGen;
                d.saldo_favor_acreditado = true;
              } catch (eSfGen) {
                console.warn('Error acreditando saldo a favor general al aprobar:', eSfGen);
              }
            }
          }
        }

        if (!d.es_abono) {
          if (recibos.length > 0) {
            await sb.from('facturas').update({ estado: 'Pagado' }).in('referencia', recibos);
          }
          if (Array.isArray(d.recibosIds) && d.recibosIds.length > 0) {
            await sb.from('facturas').update({ estado: 'Pagado' }).in('id', d.recibosIds);
          }
          if (Array.isArray(d.conveniosIds) && d.conveniosIds.length > 0) {
            await sb.from('convenios_pago').update({ estado: 'Pagado' }).in('id', d.conveniosIds);
          }
          if (Array.isArray(d.cuotas) && d.cuotas.length > 0) {
            const cIds = d.cuotas.map((c: any) => typeof c === 'object' ? (c.cuotaId || c.id) : c).filter(Boolean);
            if (cIds.length > 0) await sb.from('convenios_cuotas').update({ estado: 'Pagado' }).in('id', cIds);
          }
          if (Array.isArray(d.servicios) && d.servicios.length > 0) {
            await sb.from('servicios_especiales').update({ estado: 'Pagado' }).in('referencia', d.servicios.map((s: any) => typeof s === 'string' ? s : s.referencia).filter(Boolean));
          }
          if (Array.isArray(d.tala_poda) && d.tala_poda.length > 0) {
            await sb.from('servicios_especiales').update({ estado: 'Pagado' }).in('referencia', d.tala_poda.map((s: any) => typeof s === 'string' ? s : s.referencia).filter(Boolean));
          }
        }

        d.reverso_aplicado = false;
        upd.detalles = d;

        // Aprobar automáticamente cualquier comprobante de retención de IVA vinculado a este pago
        await sb.from('pagos_reportados').update({ estado: 'Aprobado' }).filter('detalles->>pago_vinculado', 'eq', pagoId);
      }
    }

    let q = sb.from('pagos_reportados').update(upd).eq('id', pagoId);
    if (soloSiEstado) q = q.eq('estado', soloSiEstado);
    const { data, error } = await q.select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) {
      const { data: actual } = await sb.from('pagos_reportados').select('estado').eq('id', pagoId).maybeSingle();
      if (!actual) return NextResponse.json({ error: 'El pago no existe.' }, { status: 404 });
      return NextResponse.json({ error: `Este pago ya fue procesado (estado actual: ${actual.estado}). Recargue la página.`, estado: actual.estado }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 });
  } finally {
    if (lockAcquiredId) inFlightPaymentIds.delete(lockAcquiredId);
  }
}
