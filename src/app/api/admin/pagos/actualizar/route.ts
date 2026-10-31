import { NextResponse } from 'next/server';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { descontarSaldoFavor } from '@/lib/saldoFavor';

export const dynamic = 'force-dynamic';

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
  try {
    const { pagoId, cambios, usuario, soloSiEstado } = await req.json();
    if (!pagoId || !cambios || typeof cambios !== 'object') return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });

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

    // Si se rechaza el pago, restaurar deuda del contribuyente y liberar referencia bancaria
    if (upd.estado === 'Rechazado') {
      const { data: actualP } = await sb.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
      if (actualP) {
        if (actualP.referencia && !actualP.referencia.startsWith('RECH-')) {
          upd.referencia = `RECH-${actualP.referencia}-${pagoId.slice(0, 6)}`;
        }
        let d = typeof upd.detalles === 'object' ? { ...upd.detalles } : (actualP.detalles || {});
        d.referencia_original = actualP.referencia;
        d.factura_digital = { emitida: false, pendiente: false, rechazada: true, rechazada_at: new Date().toISOString() };
        d.saldo_favor = 0;
        d.saldo_favor_bs = 0;
        d.monto_saldo_favor = 0;
        d.saldo_favor_acreditado = false;
        upd.detalles = d;

        // Determinar si el pago realmente había descontado deuda en inmuebles:
        // Solo pagos ya Aprobados / Con Diferencia o del módulo de Condominios (que descuentan al cobrar).
        // IMPORTANTE: evaluar detP.fecha_conciliado (estado previo en BD), NO detMerged.fecha_conciliado.
        const detP = typeof actualP.detalles === 'string' ? JSON.parse(actualP.detalles || '{}') : (actualP.detalles || {});
        const detMerged = { ...detP, ...d };
        const habiaDescontadoDeuda =
          actualP.estado === 'Aprobado' ||
          actualP.estado === 'Con Diferencia' ||
          Boolean(detP.fecha_conciliado) ||
          actualP.modulo === 'condominios' ||
          Boolean(detP.es_condominio) ||
          Boolean(detP.isCondominio);

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

        // Rechazar comprobantes de retención vinculados
        await sb.from('pagos_reportados').update({ estado: 'Rechazado' }).filter('detalles->>pago_vinculado', 'eq', pagoId);

        if (habiaDescontadoDeuda) {
          const prevLista = Array.isArray(detP.deuda_previa) && detP.deuda_previa.length > 0
            ? detP.deuda_previa
            : (Array.isArray(detMerged.deuda_previa) && detMerged.deuda_previa.length > 0 ? detMerged.deuda_previa : []);
          
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
                const nMeses = Math.max(0, parseInt(String(prev.meses_deuda ?? 0)));
                const updInm: any = {
                  meses_deuda: nMeses,
                  deuda_mmv: parseFloat(String(prev.deuda_mmv || 0)),
                  multa_bs: parseFloat(String(prev.multa_bs || 0)),
                  deuda_congelada_bs: parseFloat(String(prev.deuda_congelada_bs || 0)),
                  saldo_favor_bs: parseFloat(String(prev.saldo_favor_bs || 0)),
                };
                if (prev.id) await sb.from('inmuebles').update(updInm).eq('id', prev.id);
                else if (prev.inmueble) await sb.from('inmuebles').update(updInm).eq('inmueble', prev.inmueble);
              }
            }
          } else {
            // Fallback: restaurar por recibos y RIF
            const propCodes = new Set<string>();
            recibos.forEach((r: string) => {
              const m = r.match(/(?:RECIB-HIST|dummy-hist|CM|RECIB|MULTA)-([A-Z0-9_-]+)/i);
              if (m && m[1]) propCodes.add(m[1].toUpperCase());
              const mDir = r.match(/(URB\d+|AURI\d+)/i);
              if (mDir && mDir[1]) propCodes.add(mDir[1].toUpperCase());
            });
            if (detMerged.cod_inmueble) propCodes.add(String(detMerged.cod_inmueble).toUpperCase());
            if (detMerged.inmueble) propCodes.add(String(detMerged.inmueble).toUpperCase());
            if (actualP.cod_inmueble) propCodes.add(String(actualP.cod_inmueble).toUpperCase());
            if (Array.isArray(detMerged.inmuebles)) {
              detMerged.inmuebles.forEach((ic: any) => {
                if (typeof ic === 'string') propCodes.add(ic.toUpperCase());
                else if (ic?.inmueble) propCodes.add(String(ic.inmueble).toUpperCase());
              });
            }
            if (detMerged.recibo_caja) {
              const rcArr = Array.isArray(detMerged.recibo_caja) ? detMerged.recibo_caja : [detMerged.recibo_caja];
              rcArr.forEach((rc: any) => {
                if (rc?.codContribuyente) propCodes.add(String(rc.codContribuyente).toUpperCase());
                if (rc?.inmueble) propCodes.add(String(rc.inmueble).toUpperCase());
              });
            }

            const rawId = String(actualP.identidad || '').trim().toUpperCase();
            const sinG = rawId.replace(/-/g, '');
            const conG = /^[VEJPG]\d/.test(sinG) ? `${sinG[0]}-${sinG.slice(1)}` : rawId;
            const idVars = [...new Set([rawId, sinG, conG].filter(Boolean))];
            
            const orConditions = [
              ...idVars.map(v => `identidad.eq.${v}`),
              ...Array.from(propCodes).map(c => `inmueble.eq.${c}`)
            ];

            const { data: inmsAfectados } = await sb.from('inmuebles').select('*').or(orConditions.join(','));
            if (inmsAfectados && inmsAfectados.length > 0) {
              for (const inm of inmsAfectados) {
                const mesesPagados = recibos.filter((r: string) => r.toUpperCase().includes(String(inm.inmueble || '').toUpperCase())).length || 1;
                const curMeses = Math.max(0, parseInt(String(inm.meses_deuda || 0)));
                const nuevoMeses = curMeses + mesesPagados;
                const mmv = parseFloat(String(inm.mmv_mes || 0)) || (parseFloat(String(inm.deuda_mmv || 0)) / (curMeses || 1)) || 0;
                await sb.from('inmuebles').update({
                  meses_deuda: nuevoMeses,
                  deuda_mmv: parseFloat((mmv * nuevoMeses).toFixed(6)),
                }).eq('id', inm.id);
              }
            }

            // Condominios: retroceder fecha de aseo si aplica
            const esCondo = actualP.modulo === 'condominios' || detMerged.es_condominio || detMerged.modulo === 'condominios';
            if (esCondo) {
              const condoCod = detMerged.condominio?.codigo || detMerged.codigo_condominio || (Array.from(propCodes)[0]);
              if (condoCod) {
                const { data: cRow } = await sb.from('condominios').select('*').eq('codigo', condoCod).maybeSingle();
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

          // Limpiar movimientos de condominio
          await sb.from('condominio_movimientos').delete().in('pago_id', [pagoId, detMerged.pago_principal_id, detMerged.pago_vinculado].filter(Boolean));

          // Revertir y borrar/anular notas de crédito creadas por exceso o saldo a favor
          try {
            const ident = String(actualP.identidad || detMerged.identidad || '').trim().toUpperCase();
            const codCondo = String(detMerged.codigo_condominio || detMerged.condominio?.codigo || detMerged.cod_inmueble || '').trim().toUpperCase() || undefined;
            const refsToCheck = new Set<string>();
            if (pagoId) refsToCheck.add(String(pagoId));
            if (actualP.referencia) refsToCheck.add(String(actualP.referencia).trim());
            if (detMerged.referencia) refsToCheck.add(String(detMerged.referencia).trim());
            if (detMerged.referencia_original) refsToCheck.add(String(detMerged.referencia_original).trim());
            if (Array.isArray(detMerged.formasPago)) {
              detMerged.formasPago.forEach((fp: any) => fp?.referencia && refsToCheck.add(String(fp.referencia).trim()));
            }
            if (Array.isArray(detMerged.pagos_agregados)) {
              detMerged.pagos_agregados.forEach((pa: any) => pa?.referencia && refsToCheck.add(String(pa.referencia).trim()));
            }

            if (ident) {
              const { data: docsNC } = await sb
                .from('documentos')
                .select('*')
                .eq('tipo', 'Nota de Credito')
                .eq('identidad', ident);

              const matchingDocs = (docsNC || []).filter((d: any) => {
                const raw = typeof d.detalles === 'string' ? d.detalles : JSON.stringify(d.detalles || {});
                return [...refsToCheck].some(r => r.length >= 4 && raw.includes(r));
              });

              for (const dNC of matchingDocs) {
                let dDet: any = {};
                try {
                  dDet = typeof dNC.detalles === 'string' ? JSON.parse(dNC.detalles) : (dNC.detalles || {});
                } catch {}
                const mNC = parseFloat(String(dDet.monto_bs ?? dDet.monto ?? 0).replace(/[^\d.]/g, '')) || 0;
                if (mNC > 0 && ident) {
                  try {
                    await descontarSaldoFavor(ident, mNC, codCondo, sb);
                  } catch (eDesc) {
                    console.warn('Error descontando saldo a favor en pagos/actualizar:', eDesc);
                  }
                }
                await sb.from('documentos').delete().eq('id', dNC.id);
              }
            }
          } catch(e) {}
        }
      }
    }

    // Si se aprueba un pago pendiente / por verificar (por ejemplo desde Estado de Cuenta o vía API)
    // y el llamador no maneja la sincronización en cliente (skipServerDebtSync !== true):
    if (upd.estado === 'Aprobado' && !cambios.skipServerDebtSync) {
      const { data: actualP } = await sb.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
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

        // Snapshot de deuda previa antes de descontar en inmuebles (si no es de condominios, que ya descontó al cobrar)
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
                } else if (histInm.length > 0) {
                  const nuevoMeses = Math.max(0, curMeses - histInm.length);
                  const dMmv = parseFloat(String(inm.deuda_mmv || 0));
                  const mBs = parseFloat(String(inm.multa_bs || 0));
                  await sb.from('inmuebles').update({
                    meses_deuda: nuevoMeses,
                    deuda_mmv: nuevoMeses === 0 ? 0 : parseFloat(((dMmv * nuevoMeses) / (curMeses || 1)).toFixed(6)),
                    multa_bs: multaInm.length > 0 ? 0 : (nuevoMeses === 0 ? 0 : parseFloat(((mBs * nuevoMeses) / (curMeses || 1)).toFixed(2))),
                    ...(nuevoMeses === 0 ? { deuda_congelada_bs: 0 } : {})
                  }).eq('id', inm.id);
                } else if (multaInm.length > 0) {
                  await sb.from('inmuebles').update({ multa_bs: 0, deuda_congelada_bs: 0 }).eq('id', inm.id);
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
  }
}
