import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { isTerrenoInm } from '@/lib/calculos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Obtiene la fecha y hora actual en Venezuela (America/Caracas, UTC-4) en formato YYYY-MM-DD y HH:mm:ss
 */
function getCaracasNow(overrideDate?: string | null): { dateStr: string; timeStr: string; year: number; month: number; day: number } {
  const d = overrideDate ? new Date(overrideDate.includes('T') ? overrideDate : `${overrideDate}T00:05:00-04:00`) : new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
    const year = parseInt(get('year'), 10);
    const month = parseInt(get('month'), 10);
    const day = parseInt(get('day'), 10);
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const timeStr = `${get('hour')}:${get('minute')}:${get('second')}`;
    if (year > 2020) return { dateStr, timeStr, year, month, day };
  } catch {}
  // Fallback exacto UTC-4 (Venezuela no usa horario de verano)
  const vet = new Date(d.getTime() - 4 * 3600 * 1000);
  const iso = vet.toISOString();
  return {
    dateStr: iso.slice(0, 10),
    timeStr: iso.slice(11, 19),
    year: vet.getUTCFullYear(),
    month: vet.getUTCMonth() + 1,
    day: vet.getUTCDate(),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testMode = searchParams.get('test') === 'true';
  const testSecret = searchParams.get('secret');
  const simDateStr = searchParams.get('simDate');

  // Auth: requiere CRON_SECRET o INTERNAL_API_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET;
  const isAuthorized = Boolean(cronSecret && (authHeader === `Bearer ${cronSecret}` || testSecret === cronSecret));

  if (!isAuthorized) {
    return new Response('Unauthorized', { status: 401 });
  }

  const caracas = getCaracasNow(simDateStr);

  // El corte de Octubre 2026 (2026-10) y la multa de Septiembre 2026 (2026-09) entran en vigencia
  // estrictamente DESPUÉS de las 12:00 AM hora Venezuela del 01/11/2026 (2026-11-01 00:00:00-04:00).
  if (!testMode && caracas.dateStr < '2026-11-01') {
    return NextResponse.json({
      skipped: true,
      caracasDate: caracas.dateStr,
      caracasTime: caracas.timeStr,
      reason: `Aún es ${caracas.dateStr} ${caracas.timeStr} (hora Venezuela). El mes de Octubre 2026 y la multa de Septiembre 2026 se activan automáticamente después de las 12:00 AM (2026-11-01 00:00:00 VET).`
    });
  }

  const CONFIG_KEY = 'corte_mensual_2026_10';

  try {
    // 1. Verificar idempotencia en sistema_config (columnas: id, valor)
    const { data: cfgActual } = await supabase
      .from('sistema_config')
      .select('valor')
      .eq('id', CONFIG_KEY)
      .maybeSingle();

    if (!testMode && (cfgActual?.valor === 'APLICADO' || cfgActual?.valor === 'EN_PROCESO')) {
      return NextResponse.json({
        success: true,
        alreadyApplied: true,
        periodo: '2026-10',
        caracasDate: caracas.dateStr,
        caracasTime: caracas.timeStr,
        message: 'El corte mensual de Octubre 2026 (2026-10) y la multa de Septiembre 2026 ya fueron aplicados.'
      });
    }

    if (!testMode) {
      const { error: cfgErr } = await supabase.from('sistema_config').upsert({
        id: CONFIG_KEY,
        valor: 'EN_PROCESO'
      });
      if (cfgErr) throw cfgErr;
    }

    // 2. Leer todos los inmuebles activos facturables mediante paginación por cursor
    const inmRaw: any[] = [];
    let lastId: any = null;
    const STEP = 1000;
    while (true) {
      let q = supabase
        .from('inmuebles')
        .select('id, inmueble, mmv_mes, meses_deuda, deuda_mmv, multa_bs, actividad_principal, tipo, clasificacion, estado, es_condominio, condominio_padre_id, notas')
        .gt('mmv_mes', 0)
        .eq('estado', 'Activo')
        .order('id', { ascending: true })
        .limit(STEP);
      if (lastId !== null) q = q.gt('id', lastId);
      const { data: batch, error: inmErr } = await q;
      if (inmErr) throw inmErr;
      if (!batch || batch.length === 0) break;
      inmRaw.push(...batch);
      lastId = batch[batch.length - 1].id;
      if (batch.length < STEP) break;
    }

    const inmueblesFacturables = inmRaw.filter((i: any) => {
      const act = String(i.actividad_principal || '').trim().toUpperCase();
      if (act === 'N/A' || i.es_condominio === true) return false;
      if (isTerrenoInm(i)) return false;
      // Si es unidad de condominio que ya pagó su aseo (meses_deuda = 0) y solo está abonando multas viejas poco a poco (multa_bs > 0),
      // no alterar su meses_deuda desde aquí para no sumarle multas adicionales.
      const mesesAct = parseInt(String(i.meses_deuda || 0), 10) || 0;
      const multaBsAct = parseFloat(String(i.multa_bs || 0)) || 0;
      if (i.condominio_padre_id && mesesAct === 0 && multaBsAct > 0) return false;
      return true;
    });

    if (testMode) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        periodo: '2026-10',
        caracasDate: caracas.dateStr,
        caracasTime: caracas.timeStr,
        inmueblesAProcesar: inmueblesFacturables.length,
        message: `[SIMULACIÓN] Se agregaría el mes de Octubre 2026 (2026-10) y únicamente la multa de Septiembre 2026 (a quienes aún deban Septiembre) respetando los abonos parciales de multas previas.`
      });
    }

    // 3. Agrupar inmuebles por meses_deuda actual para actualización masiva ultrarrápida
    // Regla:
    // - Si meses_deuda === 0 (ya pagó Septiembre), pasa a meses_deuda = 1 (Octubre 2026, 0 multas).
    // - Si meses_deuda >= 1 (aún debe Septiembre), pasa a meses_deuda + 1 (se suma Octubre sin multa, y ÚNICAMENTE Septiembre pasa a tener multa; los meses anteriores conservan exactamente las multas que ya tenían).
    const gruposPorMeses = new Map<number, string[]>();
    const inmueblesConDeudaMmv: { id: string; nuevoMeses: number; nuevaDeudaMmv: number }[] = [];
    const inmueblesConCustomNotas: { id: string; nuevoMeses: number; nuevaDeudaMmv?: number; nuevasNotas: string }[] = [];

    for (const inm of inmueblesFacturables) {
      const mesesActual = Math.max(0, parseInt(String(inm.meses_deuda || 0), 10) || 0);
      const deudaMmvActual = parseFloat(String(inm.deuda_mmv || 0)) || 0;
      const nuevoMeses = mesesActual + 1;
      const nuevaDeudaMmv = (mesesActual > 0 && deudaMmvActual > 0)
        ? +(deudaMmvActual * nuevoMeses / mesesActual).toFixed(6)
        : undefined;

      let actualizoCustom = false;
      if (inm.notas && String(inm.notas).includes('periodos_custom')) {
        try {
          const parsed = JSON.parse(String(inm.notas));
          if (parsed && typeof parsed === 'object' && parsed.periodos_custom && typeof parsed.periodos_custom === 'object') {
            // NO tocar lleva_multa de ningún mes anterior a 2026-09 (esos ya están listos / abonados poco a poco).
            // Solo activar la multa de 2026-09 si 2026-09 sigue pendiente en periodos_custom, y agregar 2026-10 sin multa.
            if (parsed.periodos_custom['2026-09'] && mesesActual > 0) {
              parsed.periodos_custom['2026-09'].lleva_multa = true;
            }
            if (!parsed.periodos_custom['2026-10']) {
              parsed.periodos_custom['2026-10'] = {
                mmv: Number(inm.mmv_mes) || 0,
                tarifa_mmv: Number(inm.mmv_mes) || 0,
                actividad: inm.actividad_principal || undefined,
                lleva_multa: false
              };
            }
            const totalKeys = Object.keys(parsed.periodos_custom).length;
            const targetMeses = Math.max(nuevoMeses, totalKeys);
            inmueblesConCustomNotas.push({
              id: inm.id,
              nuevoMeses: targetMeses,
              nuevaDeudaMmv: (mesesActual > 0 && deudaMmvActual > 0)
                ? +(deudaMmvActual * targetMeses / mesesActual).toFixed(6)
                : undefined,
              nuevasNotas: JSON.stringify(parsed)
            });
            actualizoCustom = true;
          }
        } catch {}
      }

      if (!actualizoCustom) {
        if (nuevaDeudaMmv !== undefined) {
          inmueblesConDeudaMmv.push({ id: inm.id, nuevoMeses, nuevaDeudaMmv });
        } else {
          const arr = gruposPorMeses.get(mesesActual) || [];
          arr.push(inm.id);
          gruposPorMeses.set(mesesActual, arr);
        }
      }
    }

    // Ejecutar updates masivos de inmuebles por lotes de 500 IDs
    const tareasBatch: (() => Promise<void>)[] = [];
    for (const [mesesActual, ids] of gruposPorMeses.entries()) {
      const nuevoMeses = mesesActual + 1;
      for (let i = 0; i < ids.length; i += 500) {
        const chunkIds = ids.slice(i, i + 500);
        tareasBatch.push(async () => {
          const { error } = await supabase
            .from('inmuebles')
            .update({ meses_deuda: nuevoMeses })
            .in('id', chunkIds);
          if (error) throw error;
        });
      }
    }

    for (let i = 0; i < tareasBatch.length; i += 10) {
      await Promise.all(tareasBatch.slice(i, i + 10).map(fn => fn()));
    }

    for (let i = 0; i < inmueblesConDeudaMmv.length; i += 50) {
      await Promise.all(inmueblesConDeudaMmv.slice(i, i + 50).map(async (item) => {
        const { error } = await supabase
          .from('inmuebles')
          .update({ meses_deuda: item.nuevoMeses, deuda_mmv: item.nuevaDeudaMmv })
          .eq('id', item.id);
        if (error) throw error;
      }));
    }

    for (const item of inmueblesConCustomNotas) {
      await supabase
        .from('inmuebles')
        .update({
          meses_deuda: item.nuevoMeses,
          ...(item.nuevaDeudaMmv !== undefined ? { deuda_mmv: item.nuevaDeudaMmv } : {}),
          notas: item.nuevasNotas
        })
        .eq('id', item.id);
    }

    // 4. Actualizar Condominios y Unidades de Condominio respetando multas abonadas poco a poco:
    // Regla estricta:
    // - Si YA pagaron Septiembre 2026 (aseo_pendiente_desde IS NULL o >= '2026-10-01'):
    //   NO se les agrega ninguna multa (su multa_meses actual, si van pagando multas viejas poco a poco, queda intacta).
    //   Solo pasan a deber el aseo de Octubre 2026 ('2026-10-01') sin multa.
    // - Si AÚN deben Septiembre 2026 (aseo_pendiente_desde <= '2026-09-01'):
    //   ÚNICAMENTE se les suma +1 a `multa_meses` (correspondiente a la multa de Septiembre 2026),
    //   sin recalcular ni agregar multas de meses anteriores que ya están listas o abonadas parcialmente.

    // 4a. Condominios
    const { data: allCondos } = await supabase
      .from('condominios')
      .select('id, aseo_pendiente_desde, multa_meses, multa_exonerada_hasta, estado')
      .neq('estado', 'Eliminado');

    let condosSolventesCount = 0;
    let condosMultaSepCount = 0;
    const condosSolventesIds: string[] = [];
    const condosPorMulta = new Map<number, string[]>();

    for (const c of allCondos || []) {
      const desde = c.aseo_pendiente_desde ? String(c.aseo_pendiente_desde).slice(0, 10) : null;
      if (!desde) {
        condosSolventesIds.push(c.id);
        condosSolventesCount++;
      } else if (desde <= '2026-09-01') {
        const exonHasta = c.multa_exonerada_hasta ? String(c.multa_exonerada_hasta).slice(0, 7) : '';
        if (!exonHasta || exonHasta < '2026-09') {
          const mAct = Math.max(0, parseInt(String(c.multa_meses || 0), 10) || 0);
          const arr = condosPorMulta.get(mAct) || [];
          arr.push(c.id);
          condosPorMulta.set(mAct, arr);
          condosMultaSepCount++;
        }
      }
    }

    if (condosSolventesIds.length > 0) {
      for (let i = 0; i < condosSolventesIds.length; i += 500) {
        await supabase
          .from('condominios')
          .update({ aseo_pendiente_desde: '2026-10-01' })
          .in('id', condosSolventesIds.slice(i, i + 500));
      }
    }

    for (const [mAct, ids] of condosPorMulta.entries()) {
      for (let i = 0; i < ids.length; i += 500) {
        await supabase
          .from('condominios')
          .update({ multa_meses: mAct + 1 })
          .in('id', ids.slice(i, i + 500));
      }
    }

    // 4b. Unidades de Condominio
    const unidadesRaw: any[] = [];
    let lastUId: any = null;
    while (true) {
      let qU = supabase
        .from('condominio_unidades')
        .select('id, aseo_pendiente_desde, multa_meses, multa_exonerada_hasta, estado')
        .neq('estado', 'Eliminada')
        .order('id', { ascending: true })
        .limit(1000);
      if (lastUId !== null) qU = qU.gt('id', lastUId);
      const { data: bU, error: errU } = await qU;
      if (errU) throw errU;
      if (!bU || bU.length === 0) break;
      unidadesRaw.push(...bU);
      lastUId = bU[bU.length - 1].id;
      if (bU.length < 1000) break;
    }

    const unidadesSolventesIds: string[] = [];
    const unidadesPorMulta = new Map<number, string[]>();
    let unidadesMultaSepCount = 0;

    for (const u of unidadesRaw) {
      const desde = u.aseo_pendiente_desde ? String(u.aseo_pendiente_desde).slice(0, 10) : null;
      if (!desde) {
        unidadesSolventesIds.push(u.id);
      } else if (desde <= '2026-09-01') {
        const exonHasta = u.multa_exonerada_hasta ? String(u.multa_exonerada_hasta).slice(0, 7) : '';
        if (!exonHasta || exonHasta < '2026-09') {
          const mAct = Math.max(0, parseInt(String(u.multa_meses || 0), 10) || 0);
          const arr = unidadesPorMulta.get(mAct) || [];
          arr.push(u.id);
          unidadesPorMulta.set(mAct, arr);
          unidadesMultaSepCount++;
        }
      }
    }

    for (let i = 0; i < unidadesSolventesIds.length; i += 500) {
      await supabase
        .from('condominio_unidades')
        .update({ aseo_pendiente_desde: '2026-10-01' })
        .in('id', unidadesSolventesIds.slice(i, i + 500));
    }

    const tareasUnidadesMulta: (() => Promise<void>)[] = [];
    for (const [mAct, ids] of unidadesPorMulta.entries()) {
      const nuevoM = mAct + 1;
      for (let i = 0; i < ids.length; i += 500) {
        const chunkIds = ids.slice(i, i + 500);
        tareasUnidadesMulta.push(async () => {
          const { error } = await supabase
            .from('condominio_unidades')
            .update({ multa_meses: nuevoM })
            .in('id', chunkIds);
          if (error) throw error;
        });
      }
    }

    for (let i = 0; i < tareasUnidadesMulta.length; i += 10) {
      await Promise.all(tareasUnidadesMulta.slice(i, i + 10).map(fn => fn()));
    }

    // 5. Marcar el corte de Octubre 2026 como APLICADO
    await supabase.from('sistema_config').upsert({
      id: CONFIG_KEY,
      valor: 'APLICADO'
    });

    // 6. Registrar en Auditoría
    try {
      await supabase.from('auditoria').insert({
        usuario: 'Sistema (Corte Mensual)',
        accion: 'Activación Mes Octubre 2026 y Multa Única Septiembre 2026',
        categoria: 'FACTURACION',
        modulo: '/api/cron/billing',
        detalles: {
          criticidad: 'ALTA',
          _categoria: 'FACTURACION',
          _modulo: '/api/cron/billing',
          periodo_agregado: '2026-10',
          multa_agregada: 'Solo 2026-09 (respetando multas previas y pagos parciales)',
          inmuebles_actualizados: inmueblesFacturables.length,
          condominios_solventes_activados: condosSolventesCount,
          condominios_multa_sep_agregada: condosMultaSepCount,
          unidades_solventes_activadas: unidadesSolventesIds.length,
          unidades_multa_sep_agregada: unidadesMultaSepCount,
          fecha_caracas: `${caracas.dateStr} ${caracas.timeStr}`,
          _ts: new Date().toISOString()
        }
      });
    } catch {}

    return NextResponse.json({
      success: true,
      periodo: '2026-10',
      caracasDate: caracas.dateStr,
      caracasTime: caracas.timeStr,
      inmueblesActualizados: inmueblesFacturables.length,
      condominiosActivados: condosSolventesCount,
      condominiosMultaSep: condosMultaSepCount,
      unidadesActivadas: unidadesSolventesIds.length,
      unidadesMultaSep: unidadesMultaSepCount,
      message: `Corte de Octubre 2026 (2026-10) y multa exclusiva de Septiembre 2026 aplicados exitosamente.`
    });
  } catch (error: any) {
    console.error('Error en Corte Mensual Octubre 2026:', error);
    try {
      await supabase.from('sistema_config').upsert([
        { id: CONFIG_KEY, valor: 'ERROR' },
        { id: 'ultima_facturacion_mensual', valor: 'ERROR' },
      ], { onConflict: 'id' });
    } catch {}
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
