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
const PERMITIDOS = ['estado', 'banco', 'tipo', 'detalles', 'created_at', 'referencia'] as const;
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
        // Además, si era un pago de condominios en 'Por Verificar' sin deuda_condo_aplicada ni fecha_conciliado, NO había descontado deuda.
        const detMerged = { ...detP, ...d };
        const yaReversado = actualP.estado === 'Rechazado' || detP.reverso_aplicado === true;
        const esCondoP = actualP.modulo === 'condominios' || Boolean(detP.es_condominio) || Boolean(detP.isCondominio) || detP.modulo === 'condominios';
        const habiaDescontadoDeuda = !yaReversado && (
          actualP.estado === 'Aprobado' ||
          actualP.estado === 'Con Diferencia' ||
          Boolean(detP.fecha_conciliado) ||
          (esCondoP && (detP.deuda_condo_aplicada === true || (actualP.estado !== 'Por Verificar' && detP.deuda_condo_aplicada !== false)))
        );

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

        if (habiaDescontadoDeuda) {
          // Extraer primero los códigos de inmueble explícitamente afectados por ESTE pago
          const propCodesPago = new Set<string>();
          recibos.forEach((r: string) => {
            const m = String(r).match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+?)(?:-M\d+)?$/i);
            if (m && m[1]) propCodesPago.add(m[1].toUpperCase());
            const mDir = String(r).match(/(URB\d+|AURI\d+)/i);
            if (mDir && mDir[1]) propCodesPago.add(mDir[1].toUpperCase());
          });
          if (detMerged.cod_inmueble) propCodesPago.add(String(detMerged.cod_inmueble).trim().toUpperCase());
          if (detMerged.codigo_inmueble) propCodesPago.add(String(detMerged.codigo_inmueble).trim().toUpperCase());
          if (detMerged.inmueble) propCodesPago.add(String(detMerged.inmueble).trim().toUpperCase());
          if (actualP.cod_inmueble) propCodesPago.add(String(actualP.cod_inmueble).trim().toUpperCase());
          if (Array.isArray(detMerged.inmuebles)) {
            detMerged.inmuebles.forEach((ic: any) => {
              if (typeof ic === 'string') propCodesPago.add(ic.trim().toUpperCase());
              else if (ic?.inmueble) propCodesPago.add(String(ic.inmueble).trim().toUpperCase());
            });
          }
          if (detMerged.recibo_caja) {
            const rcArr = Array.isArray(detMerged.recibo_caja) ? detMerged.recibo_caja : [detMerged.recibo_caja];
            rcArr.forEach((rc: any) => {
              if (rc?.codContribuyente) propCodesPago.add(String(rc.codContribuyente).trim().toUpperCase());
              if (rc?.inmueble) propCodesPago.add(String(rc.inmueble).trim().toUpperCase());
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

          const usoSaldoFavorEnPago = (parseFloat(String(detMerged.saldo_usado || detMerged.descuentoSaldoFavor || 0)) || 0) > 0.01;
          const codsInmRestaurados = new Set<string>();
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
                  const { data } = await sb.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs, mmv_mes, padre_id').eq('id', prev.id).maybeSingle();
                  curInm = data;
                } else if (prev.inmueble) {
                  const { data } = await sb.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, deuda_congelada_bs, saldo_favor_bs, mmv_mes, padre_id').eq('inmueble', prev.inmueble).maybeSingle();
                  curInm = data;
                }
                const prevMeses = Math.max(0, parseInt(String(prev.meses_deuda ?? 0), 10) || 0);
                const curMeses = Math.max(0, parseInt(String(curInm?.meses_deuda ?? 0), 10) || 0);
                // NUNCA rebajar meses_deuda por debajo de lo que el inmueble ya tiene actualmente en BD
                const nMeses = Math.max(prevMeses, curMeses);
                const mmvMes = parseFloat(String(curInm?.mmv_mes || 0)) || 0;
                const prevDeudaMmv = parseFloat(String(prev.deuda_mmv || 0)) || 0;
                const curDeudaMmv = parseFloat(String(curInm?.deuda_mmv || 0)) || 0;
                const nDeudaMmv = nMeses > prevMeses && mmvMes > 0
                  ? parseFloat((nMeses * mmvMes).toFixed(6))
                  : Math.max(prevDeudaMmv, curDeudaMmv);

                const updInm: any = {
                  meses_deuda: nMeses,
                  deuda_mmv: nDeudaMmv,
                  multa_bs: Math.max(parseFloat(String(prev.multa_bs || 0)) || 0, parseFloat(String(curInm?.multa_bs || 0)) || 0),
                  deuda_congelada_bs: Math.max(parseFloat(String(prev.deuda_congelada_bs || 0)) || 0, parseFloat(String(curInm?.deuda_congelada_bs || 0)) || 0),
                };
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
          {
            const propCodes = new Set<string>(propCodesPago);
            // Excluir códigos ya restaurados mediante prevLista
            codsInmRestaurados.forEach(c => propCodes.delete(c));

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

              // Condominios: retroceder fecha de aseo si aplica y no había prevLista
              const esCondo = actualP.modulo === 'condominios' || detMerged.es_condominio || detMerged.modulo === 'condominios';
              if (esCondo && prevLista.length === 0) {
                const condoCod = detMerged.condominio?.codigo || detMerged.codigo_condominio || (Array.from(propCodes)[0]);
                if (condoCod) {
                  const { data: cRow } = await sb.from('condominios').select('*').eq('codigo', condoCod).limit(1).maybeSingle();
                  if (cRow && cRow.aseo_pendiente_desde) {
                    const mesesARevertir = recibos.length > 0 ? recibos.length : (detMerged.meses || 1);
                    const f = new Date(cRow.aseo_pendiente_desde + 'T12:00:00Z');
                    f.setMonth(f.getMonth() - mesesARevertir);
                    const nuevaFecha = f.toISOString().slice(0, 10);
                    await sb.from('condominios').update({ aseo_pendiente_desde: nuevaFecha }).eq('id', cRow.id);
                    await sb.from('condominio_unidades').update({ aseo_pendiente_desde: nuevaFecha }).eq('condominio_id', cRow.id);
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
                  const finalParentMeses = Math.max(maxMesesH, parseInt(String(parentRow.meses_deuda || 0), 10) || 0);
                  const pMmvMes = parseFloat(String(parentRow.mmv_mes || 0)) || 0;
                  await sb.from('inmuebles').update({
                    meses_deuda: finalParentMeses,
                    ...(pMmvMes > 0 ? { deuda_mmv: parseFloat((finalParentMeses * pMmvMes).toFixed(6)) } : {}),
                  }).eq('id', parentRow.id);
                }
              }
            }
          }

          // Limpiar movimientos de condominio
          await sb.from('condominio_movimientos').delete().in('pago_id', [pagoId, detMerged.pago_principal_id, detMerged.pago_vinculado].filter(Boolean));

          // Revertir y borrar/anular notas de crédito creadas por exceso o saldo a favor
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

            const teniaSnapshotSaldo = prevLista.some((p: any) => p && (p.saldo_favor_bs !== undefined || p.abono_bs !== undefined));
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
                    await descontarSaldoFavor(ident, mNC, docCodInm || codCondo, sb);
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
            if (excedentePrevio > totalDescontadoDocs + 0.05 && ident && !teniaSnapshotSaldo && prevLista.length === 0) {
              const diffDesc = Math.round((excedentePrevio - totalDescontadoDocs) * 100) / 100;
              try {
                await descontarSaldoFavor(ident, diffDesc, codCondo, sb);
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

    // Si se aprueba un pago pendiente / por verificar (por ejemplo desde Estado de Cuenta o vía API)
    // y el llamador no maneja la sincronización en cliente (skipServerDebtSync !== true):
    if (upd.estado === 'Aprobado' && !cambios.skipServerDebtSync) {
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
          const soloMultas = Boolean(condoInfo.soloMultas || d.solo_multas);
          const incluirMultas = condoInfo.incluirMultas !== undefined ? Boolean(condoInfo.incluirMultas) : !Boolean(d.sin_multas);
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
                if (mesesPagar > 0 && !soloMultas) {
                  updU.aseo_pendiente_desde = M.avanzarPendiente(uRow.aseo_pendiente_desde || cRow?.aseo_pendiente_desde, mesesPagar, hoyMes);
                }
                if (soloMultas || incluirMultas) {
                  updU.multa_meses = 0;
                }
                if (Object.keys(updU).length > 0) {
                  await sb.from('condominio_unidades').update(updU).eq('id', uRow.id);
                }
                const codU = String(uRow.inmueble || l.inmueble || '').trim().toUpperCase();
                if (codU && mesesPagar > 0 && !soloMultas) {
                  const { data: curInm } = await sb.from('inmuebles').select('id, meses_deuda, deuda_mmv, multa_bs').ilike('inmueble', codU).limit(1).maybeSingle();
                  if (curInm) {
                    const nMesesRest = Math.max(0, (parseInt(String(curInm.meses_deuda || 0)) || 0) - mesesPagar);
                    await sb.from('inmuebles').update({
                      meses_deuda: nMesesRest,
                      deuda_mmv: nMesesRest === 0 ? 0 : (curInm.deuda_mmv || 0),
                      ...(nMesesRest === 0 ? { deuda_congelada_bs: 0 } : {}),
                      multa_bs: incluirMultas ? 0 : (curInm.multa_bs || 0),
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
          const sfCondo = parseFloat(String(d.saldo_favor || d.saldo_a_favor_nuevo || d.saldo_favor_generado || 0)) || 0;
          if (sfCondo >= 1.00 && !detP.saldo_favor_acreditado && rawId) {
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
                }),
              }]);
              d.saldo_favor_acreditado = true;
            } catch (eSf) {
              console.warn('Error acreditando saldo a favor de condominio al aprobar:', eSf);
            }
          }

          d.deuda_condo_aplicada = true;
        }

        // Snapshot de deuda previa antes de descontar en inmuebles (si no es de condominios)
        if (!esCondo && idVars.length > 0) {
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
            if (!d.es_abono && (histRefs.length > 0 || multaRefs.length > 0 || recibos.includes('RECIB-DEUDA'))) {
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
