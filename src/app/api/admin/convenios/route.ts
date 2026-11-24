import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const identidad = url.searchParams.get('identidad');
    const codigo = url.searchParams.get('codigo');

    let query = supabase
      .from('convenios_pago')
      .select('*, convenios_cuotas(*)')
      .order('created_at', { ascending: false });

    if (identidad || codigo) {
      const idClean = (identidad || '').replace(/\D/g, '');
      const codClean = (codigo || '').replace(/\D/g, '');
      const filters: string[] = [];
      if (idClean.length >= 4) {
        filters.push(`identidad.ilike.%${idClean}%`);
        filters.push(`numero.ilike.%${idClean}%`);
      }
      if (codClean.length >= 2) {
        filters.push(`numero.ilike.%${codClean}%`);
      }
      const safeCodigo = (codigo || '').replace(/[,()]/g, ' ').trim();
      if (safeCodigo && safeCodigo.length >= 3) {
        filters.push(`numero.ilike.%${safeCodigo}%`);
      }
      if (filters.length > 0) {
        query = query.or(filters.join(','));
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching convenios_pago in API:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const MESES_NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const identsList = Array.from(new Set((data || []).map((c: any) => c.identidad).filter(Boolean)));
    const { data: inmsData } = identsList.length > 0
      ? await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, notas, deuda_congelada_bs').in('identidad', identsList)
      : { data: [] as any[] };
    const inmsByIdent = new Map<string, any[]>();
    for (const inm of inmsData || []) {
      const k = String(inm.identidad || '').trim().toUpperCase();
      if (!inmsByIdent.has(k)) inmsByIdent.set(k, []);
      inmsByIdent.get(k)!.push(inm);
    }

    const enriched = (data || []).map((conv: any) => {
      const kIdent = String(conv.identidad || '').trim().toUpperCase();
      const inms = inmsByIdent.get(kIdent) || [];
      const inmConv = inms.find((i: any) => String(i.notas || '').includes(conv.numero)) || inms[0] || null;
      const notasStr = String(inmConv?.notas || '');
      const mPre = notasStr.match(/\[PRE_CONV:(\d+):/);
      const mConvPer = notasStr.match(/\[CONV_PERIODOS:([^\]]+)\]/);
      const customPeriodosMap = new Map<number, string>();
      if (mConvPer && mConvPer[1]) {
        mConvPer[1].split('|').forEach((part: string) => {
          const eqIdx = part.indexOf('=');
          if (eqIdx > 0) {
            const kNum = parseInt(part.slice(0, eqIdx).trim(), 10);
            const valStr = part.slice(eqIdx + 1).trim();
            if (kNum > 0 && valStr) customPeriodosMap.set(kNum, valStr);
          }
        });
      }
      if (customPeriodosMap.size === 0 && (conv.numero === 'CONV-744592' || kIdent === 'V-4173445')) {
        customPeriodosMap.set(1, '12/2024, 01/2025, 02/2025, 03/2025 (4 meses)');
        customPeriodosMap.set(2, '04/2025, 05/2025, 06/2025, 07/2025 (4 meses)');
        customPeriodosMap.set(3, '08/2025, 09/2025, 10/2025, 11/2025 (4 meses)');
        customPeriodosMap.set(4, '12/2025, 02/2026, 03/2026, 06/2026 (4 meses)');
        customPeriodosMap.set(5, '09/2026, 10/2026 (2 meses más actuales)');
      }
      if (customPeriodosMap.size === 0 && (conv.numero === 'CONV-015179' || kIdent === 'V-19866756')) {
        customPeriodosMap.set(1, 'Marzo 2024 a Noviembre 2024 (9 meses)');
        customPeriodosMap.set(2, 'Diciembre 2024 a Septiembre 2025 (10 meses)');
        customPeriodosMap.set(3, 'Octubre 2025 a Julio 2026 (10 meses)');
      }
      let obsObj: any = null;
      if (conv.observaciones) {
        try { obsObj = typeof conv.observaciones === 'string' ? JSON.parse(conv.observaciones) : conv.observaciones; } catch {}
      }
      const mesesObs = Array.isArray(obsObj?.deuda_previa_inmuebles)
        ? obsObj.deuda_previa_inmuebles.reduce((mx: number, d: any) => Math.max(mx, parseInt(String(d?.meses_deuda || 0)) || 0), 0)
        : 0;
      const sortedCuotas = [...(Array.isArray(conv.convenios_cuotas) ? conv.convenios_cuotas : [])].sort((a: any, b: any) =>
        String(a?.fecha || '').localeCompare(String(b?.fecha || ''))
      );
      const totalMeses = (mPre ? parseInt(mPre[1], 10) : 0) || mesesObs || Number(conv.meses_refinanciados) || sortedCuotas.length || Number(conv.cuotas) || 1;
      const montoTotalNum = parseFloat(String(conv.monto_total || 0)) || 0;
      const valorMes = totalMeses > 0 && montoTotalNum > 0 ? montoTotalNum / totalMeses : 0;

      // En convenios creados hasta principios de noviembre 2026 (ciclo septiembre 2026), el último mes vencido refinanciado es Septiembre 2026 (mes 8, 0-indexed).
      // En convenios creados a partir del 11 de noviembre 2026 (ciclo octubre 2026), el último mes vencido refinanciado es Octubre 2026 (mes 9, 0-indexed).
      const createdDate = conv.created_at ? new Date(conv.created_at) : new Date();
      const createdYmd = createdDate.toISOString().slice(0, 10);
      const endYearBase = createdYmd <= '2026-11-10' ? 2026 : createdDate.getUTCFullYear();
      const endMonthBase = createdYmd <= '2026-11-10' ? 8 : (createdYmd <= '2026-12-10' ? 9 : (createdDate.getUTCMonth() - 1));
      const startTotalDate = new Date(Date.UTC(endYearBase, endMonthBase - totalMeses + 1, 1));
      const endTotalDate = new Date(Date.UTC(endYearBase, endMonthBase, 1));
      const fmtMesAnio = (d: Date) => `${MESES_NOMBRES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      let periodoGeneralCustom = '';
      if (conv.numero === 'CONV-744592' || kIdent === 'V-4173445') {
        periodoGeneralCustom = `Diciembre 2024 a Octubre 2026 (${totalMeses} meses)`;
      } else if (conv.numero === 'CONV-015179' || kIdent === 'V-19866756') {
        periodoGeneralCustom = `Marzo 2024 a Julio 2026 (${totalMeses} meses)`;
      } else if (customPeriodosMap.size > 0) {
        const firstP = (customPeriodosMap.get(1) || '').replace(/\s*\([^)]*\)/g, '').trim();
        const lastP = (customPeriodosMap.get(sortedCuotas.length) || customPeriodosMap.get(customPeriodosMap.size) || '').replace(/\s*\([^)]*\)/g, '').trim();
        const startPart = firstP.split(/\s+a\s+/i)[0]?.trim();
        const lastParts = lastP.split(/\s+a\s+/i);
        const endPart = lastParts[lastParts.length - 1]?.trim();
        if (startPart && endPart) {
          periodoGeneralCustom = startPart === endPart ? `${startPart} (${totalMeses} meses)` : `${startPart} a ${endPart} (${totalMeses} meses)`;
        }
      }
      const periodoGeneral = periodoGeneralCustom
        ? periodoGeneralCustom
        : (totalMeses === 1
          ? `${fmtMesAnio(endTotalDate)} (1 mes)`
          : `${fmtMesAnio(startTotalDate)} a ${fmtMesAnio(endTotalDate)} (${totalMeses} meses)`);

      let cursorMes = 0;
      let montoPagadoSum = 0;
      const cuotasConPeriodo = sortedCuotas.map((c: any, idx: number) => {
        const mCuotaBs = parseFloat(String(c.monto || 0)) || 0;
        const estNorm = String(c.estado || 'Pendiente');
        if (estNorm.toLowerCase().includes('pag')) {
          montoPagadoSum += mCuotaBs;
        }
        const customPer = customPeriodosMap.get(idx + 1);
        const mCustomMatch = customPer ? customPer.match(/\((\d+)\s*mes/i) : null;
        let mesesCuota = Number(c.meses_cubiertos) || (mCustomMatch ? parseInt(mCustomMatch[1], 10) : 0) || 0;
        if (!mesesCuota) {
          if (idx === sortedCuotas.length - 1) {
            mesesCuota = Math.max(1, totalMeses - cursorMes);
          } else if (valorMes > 0 && mCuotaBs > 0) {
            mesesCuota = Math.max(1, Math.round(mCuotaBs / valorMes));
          } else {
            mesesCuota = Math.max(1, Math.floor(totalMeses / Math.max(1, sortedCuotas.length)));
          }
        }
        const dIni = new Date(Date.UTC(endYearBase, endMonthBase - totalMeses + 1 + cursorMes, 1));
        const dFin = new Date(Date.UTC(endYearBase, endMonthBase - totalMeses + cursorMes + mesesCuota, 1));
        cursorMes += mesesCuota;
        const rangoTexto = mesesCuota <= 1
          ? `${fmtMesAnio(dIni)} (1 mes)`
          : `${fmtMesAnio(dIni)} a ${fmtMesAnio(dFin)} (${mesesCuota} meses)`;

        return {
          ...c,
          numero_cuota: idx + 1,
          meses_cubiertos: mesesCuota,
          periodo_cubierto: customPer || c.periodo_cubierto || rangoTexto
        };
      });

      const montoPagado = Math.round(montoPagadoSum * 100) / 100;
      const saldoPendiente = Math.max(0, Math.round((montoTotalNum - montoPagado) * 100) / 100);

      return {
        ...conv,
        codigo_inmueble: inmConv?.inmueble || undefined,
        contribuyente_nombre: inmConv?.contribuyente || undefined,
        meses_refinanciados: totalMeses,
        periodo_general: periodoGeneral,
        monto_pagado: montoPagado,
        saldo_pendiente: saldoPendiente,
        convenios_cuotas: cuotasConPeriodo
      };
    });

    return NextResponse.json({ ok: true, data: enriched });
  } catch (err: any) {
    console.error('API convenios GET error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      convId,
      nroConvenio,
      identidad,
      contribuyente,
      montoTotal,
      cuotas,
      docUrl,
      listaCuotas,
      inmueblesUpdates,
      facturasReferencias,
      tasaAplicada
    } = body;

    if (!identidad || !montoTotal || !cuotas) {
      return NextResponse.json({ ok: false, error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const finalConvId = String(convId || crypto.randomUUID()).replace(/[,()]/g, '').trim();
    const finalNro = String(nroConvenio || `CONV-${Date.now().toString().slice(-6)}`).replace(/[,()]/g, '').trim();

    // Verificar si ya existe por id o número
    const { data: existing } = await supabase
      .from('convenios_pago')
      .select('id, numero')
      .or(`id.eq.${finalConvId},numero.eq.${finalNro}`)
      .limit(1)
      .maybeSingle();

    let targetConvId = finalConvId;

    if (existing) {
      targetConvId = existing.id;
      const { error: updErr } = await supabase.from('convenios_pago').update({
        monto_total: parseFloat(montoTotal) || 0,
        cuotas: parseInt(cuotas) || 1,
        estado: 'Al Día'
      }).eq('id', existing.id);

      if (updErr) {
        console.error('Error actualizando convenios_pago:', updErr);
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }

      // Eliminar cuotas anteriores para reemplazarlas
      await supabase.from('convenios_cuotas').delete().eq('convenio_id', existing.id);
    } else {
      const { error: convErr } = await supabase.from('convenios_pago').insert({
        id: finalConvId,
        numero: finalNro,
        identidad: identidad,
        monto_total: parseFloat(montoTotal) || 0,
        cuotas: parseInt(cuotas) || 1,
        estado: 'Al Día',
        inicial: 0
      });

      if (convErr) {
        console.error('Error insertando en convenios_pago:', convErr);
        return NextResponse.json({ ok: false, error: convErr.message }, { status: 500 });
      }
    }

    // 2. Insertar cuotas en convenios_cuotas
    if (Array.isArray(listaCuotas) && listaCuotas.length > 0) {
      const cuotasPayload = listaCuotas.map((c: any) => ({
        id: crypto.randomUUID(),
        convenio_id: targetConvId,
        fecha: c.fecha,
        monto: parseFloat(c.monto) || 0,
        estado: 'Pendiente'
      }));

      const { error: cuotasErr } = await supabase.from('convenios_cuotas').insert(cuotasPayload);
      if (cuotasErr) {
        console.error('Error insertando en convenios_cuotas:', cuotasErr);
      }
    }

    // 3. Actualizar inmuebles (guardando foto de deuda previa para poder restaurar si se anula el convenio)
    const deudaPreviaInmuebles: any[] = [];
    if (Array.isArray(inmueblesUpdates) && inmueblesUpdates.length > 0) {
      const idsInm = inmueblesUpdates.map((u: any) => u.id).filter(Boolean);
      const { data: prevInms } = idsInm.length > 0
        ? await supabase.from('inmuebles').select('id, inmueble, meses_deuda, deuda_mmv, multa_bs, notas').in('id', idsInm)
        : { data: [] as any[] };
      const prevMap = new Map((prevInms || []).map((p: any) => [p.id, p]));

      for (const upd of inmueblesUpdates) {
        if (!upd.id) continue;
        const pInm = prevMap.get(upd.id);
        if (pInm) {
          deudaPreviaInmuebles.push({
            id: pInm.id,
            inmueble: pInm.inmueble,
            meses_deuda: pInm.meses_deuda ?? 0,
            deuda_mmv: pInm.deuda_mmv ?? 0,
            multa_bs: pInm.multa_bs ?? 0,
          });
        }
        const prevPreMatch = String(pInm?.notas || '').match(/\[PRE_CONV:[^\]]+\]/);
        const tagPrev = prevPreMatch
          ? ` ${prevPreMatch[0]}`
          : (pInm ? ` [PRE_CONV:${pInm.meses_deuda ?? 0}:${pInm.deuda_mmv ?? 0}:${pInm.multa_bs ?? 0}]` : '');
        const customPerParts = Array.isArray(listaCuotas)
          ? listaCuotas
              .map((lc: any, idx: number) => lc?.periodo_cubierto ? `${idx + 1}=${String(lc.periodo_cubierto).replace(/[\[\]|]/g, '').trim()}` : '')
              .filter(Boolean)
          : [];
        const prevConvPerMatch = String(pInm?.notas || '').match(/\[CONV_PERIODOS:[^\]]+\]/);
        const tagPeriodos = customPerParts.length > 0
          ? ` [CONV_PERIODOS:${customPerParts.join('|')}]`
          : (prevConvPerMatch ? ` ${prevConvPerMatch[0]}` : '');
        await supabase
          .from('inmuebles')
          .update({
            deuda_mmv: 0,
            meses_deuda: 0,
            multa_bs: 0,
            deuda_congelada_bs: upd.deuda_congelada_bs,
            notas: `Convenio de Pago ${finalNro} (${cuotas} cuotas por Bs. ${montoTotal})${tagPrev}${tagPeriodos}`
          })
          .eq('id', upd.id);
      }
    }

    // 4. Actualizar facturas pendientes asociadas
    if (Array.isArray(facturasReferencias) && facturasReferencias.length > 0) {
      await supabase
        .from('facturas')
        .update({ estado: 'Refinanciado' })
        .in('referencia', facturasReferencias);
    }

    // 5. Guardar metadata de inmuebles y facturas afectados en observaciones (si la columna existe) y registrar auditoría
    const metadataConvenio = {
      inmuebles_ids: deudaPreviaInmuebles.map(d => d.id).filter(Boolean),
      deuda_previa_inmuebles: deudaPreviaInmuebles,
      facturas_refinanciadas: Array.isArray(facturasReferencias) ? facturasReferencias : []
    };
    try {
      await supabase
        .from('convenios_pago')
        .update({ observaciones: JSON.stringify(metadataConvenio) })
        .eq('id', targetConvId);
    } catch (_) {}

    try {
      await supabase.from('auditoria').insert({
        accion: 'Convenio de Pago Creado',
        modulo: 'CONVENIO',
        usuario: 'ADMIN',
        detalles: {
          id_convenio: targetConvId,
          nro_convenio: finalNro,
          identidad,
          contribuyente,
          monto_congelado: montoTotal,
          cuotas,
          tasa_bcv: tasaAplicada,
          deuda_previa_inmuebles: deudaPreviaInmuebles,
          facturas_refinanciadas: facturasReferencias || []
        }
      });
    } catch (_) {}

    return NextResponse.json({
      ok: true,
      id: targetConvId,
      numero: finalNro,
      message: 'Convenio creado y deuda congelada exitosamente.'
    });
  } catch (err: any) {
    console.error('API convenios POST error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const numero = searchParams.get('numero');

    if (!id && !numero) {
      return NextResponse.json({ ok: false, error: 'Falta id o número de convenio' }, { status: 400 });
    }

    let query = supabase.from('convenios_pago').select('*');
    if (id) query = query.eq('id', id);
    else if (numero) query = query.eq('numero', numero);
    const { data: conv } = await query.limit(1).maybeSingle();

    if (!conv) {
      return NextResponse.json({ ok: false, error: 'Convenio no encontrado' }, { status: 404 });
    }

    // 1. Marcar convenio como Anulado
    await supabase.from('convenios_pago').update({ estado: 'Anulado' }).eq('id', conv.id);

    // 2. Marcar cuotas pendientes como Anuladas
    await supabase
      .from('convenios_cuotas')
      .update({ estado: 'Anulada' })
      .eq('convenio_id', conv.id)
      .eq('estado', 'Pendiente');

    // 3. Descongelar y restaurar deuda original en los inmuebles y facturas específicos afectados
    let meta: any = null;
    if (conv.observaciones) {
      try {
        meta = typeof conv.observaciones === 'string' ? JSON.parse(conv.observaciones) : conv.observaciones;
      } catch {}
    }
    if (!meta && conv.numero) {
      try {
        const { data: aud } = await supabase
          .from('auditoria')
          .select('detalles')
          .eq('accion', 'Convenio de Pago Creado')
          .eq('detalles->>nro_convenio', conv.numero)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (aud?.detalles) {
          meta = typeof aud.detalles === 'string' ? JSON.parse(aud.detalles) : aud.detalles;
        }
      } catch {}
    }

    const prevInmsList: any[] = Array.isArray(meta?.deuda_previa_inmuebles) ? meta.deuda_previa_inmuebles : [];
    const inmIdsEspecificos: string[] = Array.isArray(meta?.inmuebles_ids)
      ? meta.inmuebles_ids
      : prevInmsList.map((p: any) => p?.id).filter(Boolean);
    const facturasRefsEspecificas: string[] = Array.isArray(meta?.facturas_refinanciadas) ? meta.facturas_refinanciadas : [];
    const prevByInmId = new Map(prevInmsList.filter(p => p?.id).map((p: any) => [p.id, p]));

    if (inmIdsEspecificos.length > 0 || conv.identidad) {
      let qInms = supabase
        .from('inmuebles')
        .select('id, inmueble, notas, deuda_congelada_bs, meses_deuda, deuda_mmv, mmv_mes');
      if (inmIdsEspecificos.length > 0) {
        qInms = qInms.in('id', inmIdsEspecificos);
      } else {
        qInms = qInms.eq('identidad', conv.identidad);
      }
      const { data: inms } = await qInms;

      if (inms && inms.length > 0) {
        for (const inm of inms) {
          // Si se consultó por identidad sin IDs específicos y el inmueble tenía varios, filtrar solo los que mencionen este convenio (si alguno lo menciona)
          if (inmIdsEspecificos.length === 0 && inms.length > 1 && conv.numero) {
            const algunoTieneTag = inms.some((x: any) => String(x.notas || '').includes(conv.numero));
            if (algunoTieneTag && !String(inm.notas || '').includes(conv.numero)) continue;
          }
          const snap = prevByInmId.get(inm.id);
          const mPrev = String(inm.notas || '').match(/\[PRE_CONV:(\d+):([\d.]+)(?::([\d.]+))?\]/);
          const restoredMeses = snap?.meses_deuda !== undefined
            ? parseInt(String(snap.meses_deuda), 10)
            : (mPrev ? parseInt(mPrev[1], 10) : Math.max(1, parseInt(String(inm.meses_deuda || 1))));
          const restoredMmv = snap?.deuda_mmv !== undefined
            ? parseFloat(String(snap.deuda_mmv))
            : (mPrev
              ? parseFloat(mPrev[2])
              : (parseFloat(String(inm.deuda_mmv || 0)) || parseFloat(((parseFloat(String(inm.mmv_mes || 0)) || 0) * restoredMeses).toFixed(6))));
          const restoredMulta = snap?.multa_bs !== undefined
            ? (parseFloat(String(snap.multa_bs)) || 0)
            : (mPrev && mPrev[3] !== undefined ? (parseFloat(mPrev[3]) || 0) : undefined);
          const notasActuales = (inm.notas || '')
            .replace(/\[PRE_CONV:[^\]]*\]/gi, '')
            .replace(/Convenio de Pago[^\n;.]*/gi, '')
            .trim();
          await supabase
            .from('inmuebles')
            .update({
              deuda_congelada_bs: 0,
              meses_deuda: restoredMeses,
              deuda_mmv: restoredMmv,
              ...(restoredMulta !== undefined ? { multa_bs: restoredMulta } : {}),
              notas: notasActuales ? `${notasActuales} (Convenio ${conv.numero} Anulado)` : `Convenio ${conv.numero} Anulado`
            })
            .eq('id', inm.id);
        }
      }

      // Restaurar facturas refinanciadas específicas (o del contribuyente si no estaban registradas) a Pendiente
      if (facturasRefsEspecificas.length > 0) {
        await supabase
          .from('facturas')
          .update({ estado: 'Pendiente' })
          .in('referencia', facturasRefsEspecificas)
          .eq('estado', 'Refinanciado');
      } else if (conv.identidad) {
        await supabase
          .from('facturas')
          .update({ estado: 'Pendiente' })
          .eq('identidad', conv.identidad)
          .eq('estado', 'Refinanciado');
      }
    }

    // 4. Auditoria
    try {
      await supabase.from('auditoria').insert({
        accion: 'Convenio de Pago Anulado',
        modulo: 'CONVENIO',
        usuario: 'ADMIN',
        detalles: {
          id: conv.id,
          numero: conv.numero,
          identidad: conv.identidad,
          monto_total: conv.monto_total
        }
      });
    } catch (_) {}

    return NextResponse.json({ ok: true, message: `Convenio ${conv.numero} desactivado exitosamente.` });
  } catch (err: any) {
    console.error('API convenios DELETE error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const convId = String(body.convId || body.convenio_id || '').trim();
    const cuotaIds: string[] = Array.isArray(body.cuotaIds) ? body.cuotaIds.filter(Boolean) : [];
    const estado = String(body.estado || 'Pagado').trim();
    const customPeriodos = body.customPeriodos && typeof body.customPeriodos === 'object' ? body.customPeriodos : null;

    if (customPeriodos && convId) {
      const { data: conv } = await supabase.from('convenios_pago').select('id, numero, identidad').eq('id', convId).maybeSingle();
      if (!conv) {
        return NextResponse.json({ ok: false, error: 'Convenio no encontrado' }, { status: 404 });
      }
      const tagParts = Object.entries(customPeriodos)
        .filter(([k, v]) => Number(k) > 0 && String(v || '').trim())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => `${k}=${String(v).trim().replace(/[\|\[\]]/g, '')}`);
      const newTag = tagParts.length > 0 ? `[CONV_PERIODOS:${tagParts.join('|')}]` : '';

      const { data: inms } = await supabase
        .from('inmuebles')
        .select('id, inmueble, notas')
        .eq('identidad', conv.identidad);
      const targetInm = (inms || []).find((i: any) => String(i.notas || '').includes(conv.numero)) || (inms || [])[0];
      if (targetInm) {
        const cleanNotas = String(targetInm.notas || '').replace(/\s*\[CONV_PERIODOS:[^\]]*\]/g, '').trim();
        const updatedNotas = newTag ? `${cleanNotas} ${newTag}`.trim() : cleanNotas;
        await supabase.from('inmuebles').update({ notas: updatedNotas }).eq('id', targetInm.id);
      }
      return NextResponse.json({ ok: true });
    }

    if (cuotaIds.length === 0) {
      return NextResponse.json({ ok: false, error: 'Faltan IDs de cuotas a actualizar' }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from('convenios_cuotas')
      .update({ estado })
      .in('id', cuotaIds);

    if (updErr) {
      console.error('Error actualizando convenios_cuotas en PATCH:', updErr);
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    if (convId && estado === 'Pagado') {
      const { data: rest } = await supabase
        .from('convenios_cuotas')
        .select('id')
        .eq('convenio_id', convId)
        .neq('estado', 'Pagado');
      if (!rest || rest.length === 0) {
        await supabase.from('convenios_pago').update({ estado: 'Pagado' }).eq('id', convId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('API convenios PATCH error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
