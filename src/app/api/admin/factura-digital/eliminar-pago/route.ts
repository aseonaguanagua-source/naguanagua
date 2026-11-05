import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { extraerCodigoInmueble, parseDetalles } from '@/lib/documentoPago';
import { calcularMensualidad } from '@/lib/calculos';
import { descontarSaldoFavor } from '@/lib/saldoFavor';

export const dynamic = 'force-dynamic';

const CAMPOS = ['meses_deuda', 'deuda_mmv', 'multa_bs', 'deuda_congelada_bs', 'saldo_favor_bs'] as const;
const num = (v: any) => parseFloat(String(v ?? 0)) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * ELIMINAR UN PAGO Y DEVOLVER LA DEUDA (solo administrador, con motivo, queda en auditoría).
 *  - confirmar=false → vista previa de lo que se restablecerá (no cambia nada).
 *  - confirmar=true  → respalda en auditoría, restablece la deuda, reabre facturas internas y borra el pago.
 * Bloqueos: factura ya emitida en The Factory (hay que anularla) o pagos posteriores sobre los mismos inmuebles.
 */
export async function POST(req: Request) {
  try {
    const { pagoId, motivo, usuario, confirmar } = await req.json();
    if (!pagoId) return NextResponse.json({ error: 'Falta el pago' }, { status: 400 });

    // 1. Solo administrador
    const u = String(usuario || '').trim().toLowerCase();
    let cleanU = u;
    if (cleanU.includes('(')) cleanU = cleanU.split('(')[0].trim();
    if (cleanU.includes('-')) cleanU = cleanU.split('-').pop()!.trim();
    const safeU = u.replace(/[,()]/g, ' ').trim();
    const safeCleanU = cleanU.replace(/[,()]/g, ' ').trim();

    const { data: trab } = await supabase.from('trabajadores')
      .select('usuario, nombre, rol, estado')
      .or(`usuario.ilike.${safeU || 'admin'},usuario.ilike.${safeCleanU || 'admin'}`)
      .limit(1)
      .maybeSingle();

    const esAdmin = (u === 'dzara' || cleanU === 'dzara' || cleanU === 'isamar' || cleanU === 'raquel') || 
      (!!trab && (trab.rol === 'Administrador' || trab.rol === 'Super Administrador') && String(trab.estado || 'Activo').toLowerCase() === 'activo');
    if (!esAdmin) return NextResponse.json({ error: 'Solo un administrador puede eliminar pagos.' }, { status: 403 });
    if (confirmar && String(motivo || '').trim().length < 5) return NextResponse.json({ error: 'Escriba el motivo de la eliminación.' }, { status: 400 });

    // 2. Pago
    const { data: pago, error: ePago } = await supabase.from('pagos_reportados').select('*').eq('id', pagoId).maybeSingle();
    if (ePago || !pago) return NextResponse.json({ error: 'El pago no existe (¿ya fue eliminado?).' }, { status: 404 });
    const det = parseDetalles(pago.detalles);
    if (det?.factura_digital?.emitida) {
      return NextResponse.json({ error: `Este pago ya tiene la factura N° ${det.factura_digital.numero || ''} emitida en The Factory HKA. Primero anúlela y luego elimine el pago.` }, { status: 409 });
    }

    const recibos: string[] = Array.isArray(det.recibos) ? det.recibos : [];
    const previa: any[] = Array.isArray(det.deuda_previa) ? det.deuda_previa : [];
    
    // Identificar los códigos de inmueble involucrados en ESTE pago específicamente
    const codigosInvolucrados = new Set<string>();
    recibos.forEach(r => {
      const c = extraerCodigoInmueble(r);
      if (c) codigosInvolucrados.add(c.toUpperCase());
    });
    if (Array.isArray(det.recibo_caja)) {
      det.recibo_caja.forEach((rc: any) => {
        if (rc.codContribuyente) codigosInvolucrados.add(String(rc.codContribuyente).trim().toUpperCase());
      });
    }
    if (det.inmueble) codigosInvolucrados.add(String(det.inmueble).trim().toUpperCase());
    if (det.codigo_inmueble) codigosInvolucrados.add(String(det.codigo_inmueble).trim().toUpperCase());
    if (pago.inmueble) codigosInvolucrados.add(String(pago.inmueble).trim().toUpperCase());

    // Solo si no hubo códigos específicos en recibos ni detalles pero hay previa, se toman de la previa
    if (codigosInvolucrados.size === 0 && previa.length > 0) {
      previa.forEach(p => p?.inmueble && codigosInvolucrados.add(String(p.inmueble).trim().toUpperCase()));
    }

    // 3. Pagos posteriores:
    // Solo bloquean si son pagos ACTIVOS (no rechazados ni anulados) que tocan exactamente los MISMOS inmuebles.
    // Si un contribuyente tiene varios códigos/inmuebles (ej. URB002601 y URB000324), un pago sobre URB000324
    // no bloquea eliminar un pago erróneo sobre URB002601.
    const rawIdentPago = String(pago.identidad || det.identidad || '').trim().toUpperCase();
    const sinGPago = rawIdentPago.replace(/-/g, '');
    const conGPago = /^[VEJPG]\d/.test(sinGPago) ? `${sinGPago[0]}-${sinGPago.slice(1)}` : rawIdentPago;
    const identVarsPago = Array.from(new Set([rawIdentPago, sinGPago, conGPago, ...codigosInvolucrados].filter(Boolean)));

    let qPosteriores = supabase.from('pagos_reportados')
      .select('id, created_at, identidad, monto, estado, referencia, tipo, detalles')
      .gt('created_at', pago.created_at)
      .not('estado', 'in', '(Rechazado,Anulado,Reversado)');

    if (codigosInvolucrados.size === 0 && identVarsPago.length > 0) {
      qPosteriores = qPosteriores.in('identidad', identVarsPago);
    }

    const { data: posterioresGlobal } = await qPosteriores
      .order('created_at')
      .limit(5000);

    let posteriores = posterioresGlobal || [];
    if (codigosInvolucrados.size > 0 && identVarsPago.length > 0) {
      const { data: posterioresPorIdent } = await supabase.from('pagos_reportados')
        .select('id, created_at, identidad, monto, estado, referencia, tipo, detalles')
        .gt('created_at', pago.created_at)
        .not('estado', 'in', '(Rechazado,Anulado,Reversado)')
        .in('identidad', identVarsPago)
        .order('created_at')
        .limit(1000);
      const seenIds = new Set(posteriores.map((p: any) => p.id));
      for (const p of posterioresPorIdent || []) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          posteriores.push(p);
        }
      }
    }

    const choques = (posteriores || []).filter((p: any) => {
      if (p.id === pago.id) return false;

      const d = parseDetalles(p.detalles);
      const refs: string[] = Array.isArray(d.recibos) ? d.recibos : [];
      const codsPost: string[] = refs.map(r => extraerCodigoInmueble(r)).filter(Boolean) as string[];
      if (Array.isArray(d.recibo_caja)) {
        d.recibo_caja.forEach((rc: any) => {
          if (rc.codContribuyente) codsPost.push(String(rc.codContribuyente).trim().toUpperCase());
        });
      }
      if (d.inmueble) codsPost.push(String(d.inmueble).trim().toUpperCase());
      if (d.codigo_inmueble) codsPost.push(String(d.codigo_inmueble).trim().toUpperCase());

      // Si este pago tenía inmuebles identificados:
      if (codigosInvolucrados.size > 0) {
        // Solo hay choque si el pago posterior afecta a alguno de los mismos inmuebles
        return codsPost.some(c => codigosInvolucrados.has(c));
      }

      // Si no hay códigos de inmueble en ninguno, entonces sí revisamos por identidad
      return p.identidad && p.identidad === pago.identidad;
    });

    if (choques.length > 0) {
      const lista = choques.slice(0, 5).map((p: any) => `${new Date(p.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas' })} · ${p.identidad} · Bs ${num(p.monto).toFixed(2)}`).join('\n');
      return NextResponse.json({ error: `Hay ${choques.length} pago(s) posterior(es) activo(s) sobre el mismo inmueble. Elimínelos primero (del más reciente al más antiguo):\n${lista}` }, { status: 409 });
    }

    // 4. Estado actual de los inmuebles involucrados
    const previaFiltrada = previa.filter(p => {
      if (codigosInvolucrados.size > 0) {
        return p?.inmueble && codigosInvolucrados.has(String(p.inmueble).trim().toUpperCase());
      }
      return true;
    });
    const ids = previaFiltrada.map(p => p?.id).filter(Boolean);
    const codigosParaConsultar = codigosInvolucrados.size > 0 ? [...codigosInvolucrados] : [];

    const [{ data: porCodigo }, { data: porId }] = await Promise.all([
      codigosParaConsultar.length ? supabase.from('inmuebles').select('*').in('inmueble', codigosParaConsultar) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from('inmuebles').select('*').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const actuales = new Map<string, any>();
    [...(porCodigo || []), ...(porId || [])].forEach((i: any) => actuales.set(i.id, i));

    // 5. Calcular lo que se restablece
    type Cambio = { id: string; inmueble: string; antes: Record<string, number>; despues: Record<string, number> };
    const cambios: Cambio[] = [];
    let estimado = false;

    if (previaFiltrada.length > 0) {
      for (const p of previaFiltrada) {
        const act = actuales.get(p.id) || [...actuales.values()].find(i => String(i.inmueble).toUpperCase() === String(p.inmueble).toUpperCase());
        if (!act) continue;
        const antes: any = {}, despues: any = {};
        let difiere = false;
        for (const c of CAMPOS) {
          antes[c] = num(act[c]); despues[c] = num(p[c]);
          if (Math.abs(antes[c] - despues[c]) > 0.000001) difiere = true;
        }
        if (difiere) cambios.push({ id: act.id, inmueble: act.inmueble, antes, despues });
      }
    } else {
      // Pagos sin foto (anteriores al 06/10): se estima con los meses y multas cobrados
      estimado = true;
      if (det.es_abono || recibos.includes('RECIB-DEUDA')) {
        return NextResponse.json({ error: 'Este pago es un abono o "deuda total" sin foto de la deuda anterior: no se puede calcular con seguridad cuánto devolver. Ajuste la deuda manualmente desde Contribuyentes y luego elimine el pago.' }, { status: 409 });
      }
      const tasa = num(det.tasa_bcv_aplicada || det.tasa_bcv);
      const montos = det.montos && typeof det.montos === 'object' ? det.montos : {};
      for (const cod of codigosInvolucrados) {
        const act = [...actuales.values()].find(i => String(i.inmueble).toUpperCase() === cod);
        if (!act) continue;
        const mesesPagados = recibos.filter(r => new RegExp(`^RECIB-HIST-${cod}-M\\d+$`, 'i').test(r)).length;
        const multaPagada = recibos.filter(r => /^MULTA-/i.test(r) && extraerCodigoInmueble(r) === cod).reduce((s, r) => s + num(montos[r]), 0);
        if (!mesesPagados && !multaPagada) continue;
        const antes: any = {}; CAMPOS.forEach(c => { antes[c] = num(act[c]); });
        const despues: any = { ...antes };
        if (mesesPagados) {
          despues.meses_deuda = antes.meses_deuda + mesesPagados;
          despues.deuda_mmv = antes.meses_deuda > 0 && antes.deuda_mmv > 0
            ? +(antes.deuda_mmv * despues.meses_deuda / antes.meses_deuda).toFixed(6)
            : (tasa > 0 ? +((calcularMensualidad(act, tasa) / (57 * tasa)) * despues.meses_deuda).toFixed(6) : antes.deuda_mmv);
        }
        if (multaPagada) despues.multa_bs = r2(antes.multa_bs + multaPagada);
        cambios.push({ id: act.id, inmueble: act.inmueble, antes, despues });
      }
    }

    // Facturas internas que el cobro marcó como pagadas
    const { data: facturas } = recibos.length
      ? await supabase.from('facturas').select('id, referencia, estado').in('referencia', recibos)
      : { data: [] as any[] };
    const facturasReabrir = (facturas || []).filter((f: any) => /pagad/i.test(String(f.estado || '')));

    const resumen = {
      pago: { id: pago.id, identidad: pago.identidad, monto: num(pago.monto), fecha: pago.created_at, cajero: det.cajero || null, referencia: pago.referencia || null },
      estimado, cambios, facturasReabrir: facturasReabrir.map((f: any) => f.referencia),
    };
    if (!confirmar) return NextResponse.json({ preview: true, ...resumen });

    // 6. Respaldo completo en auditoría ANTES de tocar nada
    const { error: eAud } = await supabase.from('auditoria').insert({
      accion: 'Eliminación de pago (deuda restablecida)',
      usuario: trab ? `${trab.nombre || trab.usuario} (${trab.usuario})` : u,
      detalles: {
        identidad: pago.identidad, motivo: String(motivo).trim(), estimado,
        pago_respaldo: pago,
        inmuebles_antes: cambios.map(c => ({ ...actuales.get(c.id) })),
        cambios, facturas_reabiertas: facturasReabrir.map((f: any) => f.referencia),
        _categoria: 'PAGOS', criticidad: 'ALTA',
      },
    });
    if (eAud) return NextResponse.json({ error: `No se pudo guardar el respaldo en auditoría: ${eAud.message}. No se eliminó nada.` }, { status: 500 });

    // 7. Restablecer deuda
    for (const c of cambios) {
      const { error } = await supabase.from('inmuebles').update(c.despues).eq('id', c.id);
      if (error) return NextResponse.json({ error: `Falló al restablecer ${c.inmueble}: ${error.message}. El pago NO se eliminó; el respaldo quedó en auditoría.` }, { status: 500 });
    }
    if (facturasReabrir.length) {
      await supabase.from('facturas').update({ estado: 'Pendiente' }).in('id', facturasReabrir.map((f: any) => f.id));
    }

    // 7.0 Revertir estado de Condominio (condominio_unidades, condominios, condominio_multas y condominio_movimientos)
    const esPagoCondominio = Boolean(
      det?.condominio?.condominio_id ||
      det?.condominio?.codigo ||
      det?.modo === 'CONDOMINIO' ||
      det?.modalidad_cobro ||
      pago.modulo === 'condominios' ||
      det?.modulo === 'condominios' ||
      det?.es_condominio
    );
    if (esPagoCondominio) {
      try {
        // a) Revertir desde deuda_previa (unidades y condominio)
        for (const p of previa) {
          if (p?.unidad) {
            const updU: any = {};
            if (p.aseo_pendiente_desde !== undefined) updU.aseo_pendiente_desde = p.aseo_pendiente_desde;
            if (p.multa_meses !== undefined) updU.multa_meses = p.multa_meses || 0;
            if (p.multa_exonerada_hasta !== undefined) updU.multa_exonerada_hasta = p.multa_exonerada_hasta || null;
            if (Object.keys(updU).length > 0) {
              await supabase.from('condominio_unidades').update(updU).eq('id', p.unidad);
            }
          }
          if (p?.condominio) {
            const updC: any = {};
            if (p.aseo_pendiente_desde !== undefined) updC.aseo_pendiente_desde = p.aseo_pendiente_desde;
            if (p.multa_meses !== undefined) updC.multa_meses = p.multa_meses || 0;
            if (Object.keys(updC).length > 0) {
              await supabase.from('condominios').update(updC).eq('id', p.condominio);
            }
          }
        }

        // b) Buscar movimientos en condominio_movimientos asociados a este pago
        const idsMovPago = [pago.id, det?.pago_principal_id, det?.pago_vinculado].filter(Boolean);
        let movsCondo: any[] = [];
        if (idsMovPago.length > 0) {
          const { data: mByPago } = await supabase.from('condominio_movimientos').select('*').in('pago_id', idsMovPago);
          if (mByPago && mByPago.length > 0) movsCondo.push(...mByPago);
        }
        if (pago.referencia) {
          try {
            const { data: mByRef } = await supabase.from('condominio_movimientos').select('*').eq('referencia', pago.referencia);
            if (mByRef && mByRef.length > 0) {
              const seen = new Set(movsCondo.map(m => m.id));
              mByRef.forEach(m => { if (!seen.has(m.id)) movsCondo.push(m); });
            }
          } catch {}
        }

        // c) Revertir snapshot_unidades (desde condominio_movimientos o detalles.condominio.locales)
        const snapshotsUnidades: any[] = [];
        if (Array.isArray(det?.snapshot_unidades)) snapshotsUnidades.push(...det.snapshot_unidades);
        if (Array.isArray(det?.condominio?.snapshot_unidades)) snapshotsUnidades.push(...det.condominio.snapshot_unidades);
        if (Array.isArray(det?.condominio?.locales)) snapshotsUnidades.push(...det.condominio.locales);
        for (const m of movsCondo) {
          const mDet = typeof m.detalles === 'string' ? (() => { try { return JSON.parse(m.detalles); } catch { return {}; } })() : (m.detalles || {});
          if (Array.isArray(m.snapshot_unidades)) snapshotsUnidades.push(...m.snapshot_unidades);
          if (Array.isArray(mDet?.snapshot_unidades)) snapshotsUnidades.push(...mDet.snapshot_unidades);
        }
        for (const su of snapshotsUnidades) {
          const uId = su?.id || su?.unidad_id || su?.unidad;
          if (!uId) continue;
          const updSu: any = {};
          if (su.aseo_pendiente_desde !== undefined) updSu.aseo_pendiente_desde = su.aseo_pendiente_desde;
          if (su.multa_meses !== undefined) updSu.multa_meses = su.multa_meses;
          if (su.multa_exonerada_hasta !== undefined) updSu.multa_exonerada_hasta = su.multa_exonerada_hasta;
          if (su.deuda_bs !== undefined) updSu.deuda_bs = su.deuda_bs;
          if (su.meses_mora !== undefined) updSu.meses_mora = su.meses_mora;
          if (Object.keys(updSu).length > 0) {
            await supabase.from('condominio_unidades').update(updSu).eq('id', uId);
          }
        }

        // d) Revertir snapshot_condominio en condominios (deuda_total_bs, abono_bs, multa_bs, meses_mora, aseo_pendiente_desde, multa_meses)
        let snapCondo = det?.snapshot_condominio || det?.condominio?.snapshot_condominio || null;
        if (!snapCondo) {
          for (const m of movsCondo) {
            const mDet = typeof m.detalles === 'string' ? (() => { try { return JSON.parse(m.detalles); } catch { return {}; } })() : (m.detalles || {});
            if (m.snapshot_condominio || mDet?.snapshot_condominio) {
              snapCondo = m.snapshot_condominio || mDet.snapshot_condominio;
              break;
            }
          }
        }
        const targetCondoId = snapCondo?.id || det?.condominio?.condominio_id || movsCondo[0]?.condominio_id;
        const targetCondoCod = snapCondo?.codigo || det?.condominio?.codigo || det?.codigo_condominio;
        if (snapCondo && (targetCondoId || targetCondoCod)) {
          const updSnapC: any = {};
          for (const k of ['deuda_total_bs', 'abono_bs', 'multa_bs', 'meses_mora', 'aseo_pendiente_desde', 'multa_meses']) {
            if (snapCondo[k] !== undefined) updSnapC[k] = snapCondo[k];
          }
          if (Object.keys(updSnapC).length > 0) {
            if (targetCondoId) await supabase.from('condominios').update(updSnapC).eq('id', targetCondoId);
            else if (targetCondoCod) await supabase.from('condominios').update(updSnapC).eq('codigo', targetCondoCod);
          }
        }

        // e) Restaurar multas en condominio_multas (reabrir pagadas por este pago o reinsertar multas_eliminadas_snapshot)
        if (idsMovPago.length > 0) {
          await supabase.from('condominio_multas').update({ estado: 'Pendiente', pago_id: null }).in('pago_id', idsMovPago);
        }
        const multasElimSnap: any[] = [];
        if (Array.isArray(det?.multas_eliminadas_snapshot)) multasElimSnap.push(...det.multas_eliminadas_snapshot);
        if (Array.isArray(det?.condominio?.multas_eliminadas_snapshot)) multasElimSnap.push(...det.condominio.multas_eliminadas_snapshot);
        for (const m of movsCondo) {
          const mDet = typeof m.detalles === 'string' ? (() => { try { return JSON.parse(m.detalles); } catch { return {}; } })() : (m.detalles || {});
          if (Array.isArray(mDet?.multas_eliminadas_snapshot)) multasElimSnap.push(...mDet.multas_eliminadas_snapshot);
        }
        if (multasElimSnap.length > 0) {
          await supabase.from('condominio_multas').upsert(multasElimSnap, { onConflict: 'id' });
        }

        // f) Eliminar movimientos en condominio_movimientos correspondientes al pago eliminado
        if (idsMovPago.length > 0) {
          await supabase.from('condominio_movimientos').delete().in('pago_id', idsMovPago);
        }
        if (movsCondo.length > 0) {
          await supabase.from('condominio_movimientos').delete().in('id', movsCondo.map(m => m.id).filter(Boolean));
        }
      } catch (eCondoRev) {
        console.warn('Error revirtiendo estado de condominio en eliminar-pago:', eCondoRev);
      }
    }

    // 7.1 Eliminar Notas de Crédito generadas por este pago en documentos
    try {
      const rawIdent = String(pago.identidad || det.identidad || '').trim().toUpperCase();
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

      const refsToCheck = new Set<string>([String(pago.id)]);
      addRefTokens(refsToCheck, pago.referencia);
      addRefTokens(refsToCheck, det.referencia);
      addRefTokens(refsToCheck, det.referencia_original);

      if (identVariants.length > 0) {
        const { data: docsNC } = await supabase.from('documentos').select('*').eq('tipo', 'Nota de Credito').in('identidad', identVariants);
        const matchingDocs = (docsNC || []).filter((d: any) => {
          const raw = typeof d.detalles === 'string' ? d.detalles : JSON.stringify(d.detalles || {});
          return [...refsToCheck].some(r => r.length >= 4 && raw.includes(r));
        });
        for (const dNC of matchingDocs) {
          let dDet: any = {};
          try { dDet = typeof dNC.detalles === 'string' ? JSON.parse(dNC.detalles) : (dNC.detalles || {}); } catch {}
          const rawM = String(dDet.monto_bs ?? dDet.monto ?? 0);
          const mNC = (rawM.includes(',') ? parseFloat(rawM.replace(/\./g, '').replace(',', '.')) : parseFloat(rawM.replace(/[^\d.]/g, ''))) || 0;
          if (mNC > 0 && ident && previaFiltrada.length === 0) {
            try { await descontarSaldoFavor(ident, mNC, codCondo, supabase); } catch {}
          }
          await supabase.from('documentos').delete().eq('id', dNC.id);
        }
      }
    } catch (eNC) {
      console.warn('Error eliminando nota de credito en eliminar-pago:', eNC);
    }

    // 8. Borrar el pago
    const { error: eDel } = await supabase.from('pagos_reportados').delete().eq('id', pago.id);
    if (eDel) return NextResponse.json({ error: `La deuda se restableció pero no se pudo borrar el pago: ${eDel.message}` }, { status: 500 });

    return NextResponse.json({ ok: true, ...resumen });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error inesperado' }, { status: 500 });
  }
}
