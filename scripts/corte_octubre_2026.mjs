import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales de Supabase en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function getCaracasNow() {
  const d = new Date();
  const vet = new Date(d.getTime() - 4 * 3600 * 1000);
  const iso = vet.toISOString();
  return {
    dateStr: iso.slice(0, 10),
    timeStr: iso.slice(11, 19),
  };
}

function isTerreno(inm) {
  const act = String(inm.actividad_principal || '').toUpperCase();
  const tipo = String(inm.tipo || '').toUpperCase();
  const clas = String(inm.clasificacion || '').toUpperCase();
  return act.includes('TERRENO') || tipo.includes('TERRENO') || clas.includes('TERRENO');
}

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  const caracas = getCaracasNow();

  console.log(`[Corte Octubre 2026] Hora actual Venezuela: ${caracas.dateStr} ${caracas.timeStr}`);

  if (!force && !dryRun && caracas.dateStr < '2026-11-01') {
    console.log('⏳ Aún no son las 12:00 AM del 01/11/2026 en Venezuela. No se aplicó el corte.');
    return;
  }

  const CONFIG_KEY = 'corte_mensual_2026_10';
  const { data: cfg } = await supabase.from('sistema_config').select('valor').eq('id', CONFIG_KEY).maybeSingle();

  if (!force && !dryRun && cfg?.valor === 'APLICADO') {
    console.log('✅ El corte mensual de Octubre 2026 (2026-10) y la multa única de Septiembre 2026 ya fueron aplicados.');
    return;
  }

  if (!dryRun) {
    await supabase.from('sistema_config').upsert({
      id: CONFIG_KEY,
      valor: 'EN_PROCESO',
      descripcion: 'Corte mensual de facturación Octubre 2026 (2026-10) y multa única de Septiembre 2026',
      updated_at: new Date().toISOString()
    });
  }

  const inmRaw = [];
  let lastId = null;
  while (true) {
    let q = supabase
      .from('inmuebles')
      .select('id, inmueble, mmv_mes, meses_deuda, multa_bs, actividad_principal, tipo, clasificacion, estado, es_condominio, condominio_padre_id, notas')
      .gt('mmv_mes', 0)
      .eq('estado', 'Activo')
      .order('id', { ascending: true })
      .limit(1000);
    if (lastId !== null) q = q.gt('id', lastId);
    const { data: batch, error } = await q;
    if (error) throw error;
    if (!batch || batch.length === 0) break;
    inmRaw.push(...batch);
    lastId = batch[batch.length - 1].id;
    if (batch.length < 1000) break;
  }

  const inmueblesFacturables = inmRaw.filter(i => {
    const act = String(i.actividad_principal || '').trim().toUpperCase();
    if (act === 'N/A' || i.es_condominio === true) return false;
    if (isTerreno(i)) return false;
    // Si es unidad de condominio que ya pagó su aseo (meses_deuda = 0) y solo está abonando multas viejas poco a poco (multa_bs > 0),
    // no alterar su meses_deuda desde aquí para no sumarle multas adicionales.
    const mesesAct = parseInt(String(i.meses_deuda || 0), 10) || 0;
    const multaBsAct = parseFloat(String(i.multa_bs || 0)) || 0;
    if (i.condominio_padre_id && mesesAct === 0 && multaBsAct > 0) return false;
    return true;
  });

  console.log(`📊 Inmuebles activos a procesar: ${inmueblesFacturables.length}`);

  if (dryRun) {
    console.log('[DRY RUN] Simulación completada sin escritura.');
    return;
  }

  const gruposPorMeses = new Map();
  const customUpdates = [];

  for (const inm of inmueblesFacturables) {
    const mAct = Math.max(0, parseInt(String(inm.meses_deuda || 0), 10) || 0);
    const nuevoMeses = mAct + 1;
    let isCustom = false;
    if (inm.notas && String(inm.notas).includes('periodos_custom')) {
      try {
        const parsed = JSON.parse(String(inm.notas));
        if (parsed?.periodos_custom && typeof parsed.periodos_custom === 'object') {
          // NO tocar lleva_multa de ningún mes anterior a 2026-09 (esos ya están listos / abonados poco a poco).
          // Solo activar la multa de 2026-09 si 2026-09 sigue pendiente, y agregar 2026-10 sin multa.
          if (parsed.periodos_custom['2026-09'] && mAct > 0) {
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
          customUpdates.push({
            id: inm.id,
            nuevoMeses: Math.max(nuevoMeses, totalKeys),
            nuevasNotas: JSON.stringify(parsed)
          });
          isCustom = true;
        }
      } catch {}
    }
    if (!isCustom) {
      const arr = gruposPorMeses.get(mAct) || [];
      arr.push(inm.id);
      gruposPorMeses.set(mAct, arr);
    }
  }

  const tareas = [];
  for (const [mAct, ids] of gruposPorMeses.entries()) {
    const nuevoMeses = mAct + 1;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      tareas.push(async () => {
        const { error } = await supabase.from('inmuebles').update({ meses_deuda: nuevoMeses }).in('id', chunk);
        if (error) throw error;
      });
    }
  }

  for (let i = 0; i < tareas.length; i += 10) {
    await Promise.all(tareas.slice(i, i + 10).map(fn => fn()));
  }

  for (const item of customUpdates) {
    await supabase.from('inmuebles').update({ meses_deuda: item.nuevoMeses, notas: item.nuevasNotas }).eq('id', item.id);
  }

  // Condominios: respetar multas abonadas poco a poco y sumar únicamente +1 (Septiembre 2026) a quienes deban Septiembre
  const { data: allCondos } = await supabase
    .from('condominios')
    .select('id, aseo_pendiente_desde, multa_meses, multa_exonerada_hasta, estado')
    .neq('estado', 'Eliminado');

  const condosSolventesIds = [];
  const condosPorMulta = new Map();

  for (const c of allCondos || []) {
    const desde = c.aseo_pendiente_desde ? String(c.aseo_pendiente_desde).slice(0, 10) : null;
    if (!desde) {
      condosSolventesIds.push(c.id);
    } else if (desde <= '2026-09-01') {
      const exonHasta = c.multa_exonerada_hasta ? String(c.multa_exonerada_hasta).slice(0, 7) : '';
      if (!exonHasta || exonHasta < '2026-09') {
        const mAct = Math.max(0, parseInt(String(c.multa_meses || 0), 10) || 0);
        const arr = condosPorMulta.get(mAct) || [];
        arr.push(c.id);
        condosPorMulta.set(mAct, arr);
      }
    }
  }

  for (let i = 0; i < condosSolventesIds.length; i += 500) {
    await supabase.from('condominios').update({ aseo_pendiente_desde: '2026-10-01' }).in('id', condosSolventesIds.slice(i, i + 500));
  }
  for (const [mAct, ids] of condosPorMulta.entries()) {
    for (let i = 0; i < ids.length; i += 500) {
      await supabase.from('condominios').update({ multa_meses: mAct + 1 }).in('id', ids.slice(i, i + 500));
    }
  }

  // Unidades de Condominio: respetar multas abonadas poco a poco y sumar únicamente +1 (Septiembre 2026) a quienes deban Septiembre
  const unidadesRaw = [];
  let lastUId = null;
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

  const unidadesSolventesIds = [];
  const unidadesPorMulta = new Map();

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
      }
    }
  }

  for (let i = 0; i < unidadesSolventesIds.length; i += 500) {
    await supabase.from('condominio_unidades').update({ aseo_pendiente_desde: '2026-10-01' }).in('id', unidadesSolventesIds.slice(i, i + 500));
  }
  const tareasUnidadesMulta = [];
  for (const [mAct, ids] of unidadesPorMulta.entries()) {
    const nuevoM = mAct + 1;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      tareasUnidadesMulta.push(async () => {
        const { error } = await supabase.from('condominio_unidades').update({ multa_meses: nuevoM }).in('id', chunk);
        if (error) throw error;
      });
    }
  }
  for (let i = 0; i < tareasUnidadesMulta.length; i += 10) {
    await Promise.all(tareasUnidadesMulta.slice(i, i + 10).map(fn => fn()));
  }

  await supabase.from('sistema_config').upsert({
    id: CONFIG_KEY,
    valor: 'APLICADO',
    descripcion: `Corte Octubre 2026 y multa Septiembre 2026 aplicados el ${caracas.dateStr} ${caracas.timeStr} VET (${inmueblesFacturables.length} inmuebles)`,
    updated_at: new Date().toISOString()
  });

  console.log(`✅ Corte Octubre 2026 y multa única de Septiembre 2026 aplicados: ${inmueblesFacturables.length} inmuebles, ${condosSolventesIds.length} condominios solventes, ${unidadesSolventesIds.length} unidades solventes.`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
