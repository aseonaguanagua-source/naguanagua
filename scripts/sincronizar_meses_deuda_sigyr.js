const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('================================================================');
  console.log('🔄 INICIANDO SINCRONIZACIÓN DE MESES DE DEUDA: SISTEMA ACTUAL VS SIGYR');
  console.log('================================================================');

  // 1. Cargar datos maestros de SIGYR
  const sigyrDataPath = path.join(__dirname, 'sigyr_summary.json');
  console.log('📂 Cargando datos maestros de SIGYR desde sigyr_summary.json...');
  const sigyrData = JSON.parse(fs.readFileSync(sigyrDataPath, 'utf8'));

  const sigyrPropMap = new Map();
  sigyrData.sigyr_prop_debts.forEach(p => {
    if (p.code) sigyrPropMap.set(p.code.trim().toUpperCase(), p);
  });
  console.log(`✅ Propiedades cargadas de SIGYR: ${sigyrPropMap.size.toLocaleString()}`);

  // 2. Cargar inmuebles de Supabase paginados
  console.log('📂 Descargando todos los inmuebles de Supabase...');
  let allInms = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, meses_deuda, deuda_mmv, mmv_mes, estado, tipo, actividad_principal, es_condominio, condominio_padre_id, padre_id')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error('Error fetching inmuebles:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allInms.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`✅ Inmuebles en Supabase: ${allInms.length.toLocaleString()}`);

  // 3. Proteger pagos en el nuevo sistema
  console.log('📂 Cargando pagos aprobados del nuevo sistema para protección con paginación...');
  let allPagos = [];
  let pagePagos = 0;
  while (true) {
    const { data, error } = await supabase.from('pagos_reportados')
      .select('identidad, detalles, estado')
      .eq('estado', 'Aprobado')
      .range(pagePagos * 1000, (pagePagos + 1) * 1000 - 1);
    if (error || !data || data.length === 0) break;
    allPagos.push(...data);
    if (data.length < 1000) break;
    pagePagos++;
  }

  function cleanRif(r) {
    if (!r) return '';
    return r.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  const paidInmCodes = new Set();
  const paidIdents = new Set();
  allPagos.forEach(p => {
    if (p.identidad) {
      paidIdents.add(p.identidad.trim().toUpperCase());
      const c = cleanRif(p.identidad);
      if (c) paidIdents.add(c);
    }
    const det = JSON.stringify(p.detalles || '');
    const matches = det.match(/(URB|AURI)\d+/gi) || [];
    matches.forEach(m => paidInmCodes.add(m.toUpperCase()));
  });
  console.log(`🛡️ Inmuebles y contribuyentes con pagos en nuevo sistema protegidos: ${paidInmCodes.size} inmuebles, ${paidIdents.size} identidades (de ${allPagos.length} pagos)`);

  // 4. Preparar plan de ajuste
  const plan = [];
  const backup = [];

  let countCondos = 0;
  let countLocales = 0;
  let countResidenciales = 0;
  let countProtegidos = 0;
  let countEliminados = 0;
  let countTerrenos = 0;

  for (const inm of allInms) {
    const code = (inm.inmueble || '').trim().toUpperCase();
    const st = String(inm.estado || '').trim().toLowerCase();
    const isElim = st === 'eliminado' || st === 'inactivo' || st === 'desactivado';
    if (isElim) {
      countEliminados++;
      continue;
    }

    const act = (inm.actividad_principal || '').toUpperCase();
    if (act.includes('TERRENO')) {
      countTerrenos++;
      continue;
    }

    const sigyr = sigyrPropMap.get(code);
    if (!sigyr) continue;

    const idClean = (inm.identidad || '').trim().toUpperCase();
    const hasPaid = paidInmCodes.has(code) || (idClean && (paidIdents.has(idClean) || paidIdents.has(cleanRif(idClean))));
    if (hasPaid) {
      countProtegidos++;
      continue;
    }

    const curMonths = parseInt(String(inm.meses_deuda || 0), 10) || 0;
    const targetMonths = parseInt(String(sigyr.pending_months || 0), 10) || 0;

    if (curMonths !== targetMonths) {
      const isCondo = inm.es_condominio === true;
      const isCom = (inm.tipo || '').toUpperCase().includes('COMERCIAL');

      if (isCondo) countCondos++;
      else if (isCom) countLocales++;
      else countResidenciales++;

      const mmv = parseFloat(String(inm.mmv_mes || 0)) || 0;
      const newDeudaMMV = Math.round(mmv * targetMonths * 10000) / 10000;

      backup.push({
        id: inm.id,
        inmueble: code,
        meses_deuda: curMonths,
        deuda_mmv: inm.deuda_mmv
      });

      plan.push({
        id: inm.id,
        inmueble: code,
        meses_deuda: targetMonths,
        deuda_mmv: newDeudaMMV,
        diff: targetMonths - curMonths
      });
    }
  }

  console.log('\n📊 RESUMEN DEL PLAN DE ACTUALIZACIÓN:');
  console.log(`  • Total inmuebles a sincronizar: ${plan.length.toLocaleString()}`);
  console.log(`    ↳ Condominios matrices: ${countCondos.toLocaleString()}`);
  console.log(`    ↳ Locales comerciales: ${countLocales.toLocaleString()}`);
  console.log(`    ↳ Residenciales: ${countResidenciales.toLocaleString()}`);
  console.log(`  • Inmuebles protegidos (pagos nuevos): ${countProtegidos.toLocaleString()}`);
  console.log(`  • Eliminados/Inactivos omitidos: ${countEliminados.toLocaleString()}`);
  console.log(`  • Terrenos omitidos: ${countTerrenos.toLocaleString()}`);

  // 5. Guardar backup antes de aplicar
  const backupFile = path.join(__dirname, `backup_meses_deuda_antes_de_sync_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`\n💾 Backup previo guardado exitosamente en: ${backupFile}`);

  // 6. Aplicar cambios en lotes de 100
  console.log('\n🚀 Aplicando actualización a la base de datos Supabase...');
  const BATCH_SIZE = 100;
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < plan.length; i += BATCH_SIZE) {
    const chunk = plan.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async item => {
        const { error } = await supabase
          .from('inmuebles')
          .update({
            meses_deuda: item.meses_deuda,
            deuda_mmv: item.deuda_mmv
          })
          .eq('id', item.id);

        if (error) {
          errorCount++;
          console.error(`Error actualizando ${item.inmueble}:`, error.message);
        } else {
          updatedCount++;
        }
      })
    );

    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= plan.length) {
      const pct = Math.min(100, Math.round(((i + BATCH_SIZE) / plan.length) * 100));
      console.log(`  -> Progreso: ${Math.min(i + BATCH_SIZE, plan.length)} / ${plan.length} (${pct}%)`);
    }
  }

  console.log('\n================================================================');
  console.log(`✅ SINCRONIZACIÓN COMPLETADA CON ÉXITO:`);
  console.log(`   Actualizados correctamente: ${updatedCount.toLocaleString()}`);
  console.log(`   Errores: ${errorCount}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('Error fatal en ejecución:', err);
  process.exit(1);
});
