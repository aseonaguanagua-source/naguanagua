const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function mesActualCaracas(hoy = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit' }).format(hoy);
  const [y, m] = s.split('-').map(Number);
  return { y, m };
}
const aIndice = (y, m) => y * 12 + (m - 1);
const deIndice = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;
function pendienteDesdeParaMeses(n, hoy = new Date()) {
  if (n <= 0) return null;
  const { y, m } = mesActualCaracas(hoy);
  return deIndice(aIndice(y, m) - n);
}

async function main() {
  console.log('================================================================');
  console.log('🏢 INICIANDO AJUSTE DE MESES Y FECHAS EN MÓDULO DE CONDOMINIOS');
  console.log('================================================================');

  // 1. Cargar SIGYR
  const sigyrDataPath = path.join(__dirname, 'sigyr_summary.json');
  console.log('📂 Cargando datos de SIGYR...');
  const sigyrData = JSON.parse(fs.readFileSync(sigyrDataPath, 'utf8'));
  const sigyrPropMap = new Map();
  sigyrData.sigyr_prop_debts.forEach(p => {
    if (p.code) sigyrPropMap.set(p.code.trim().toUpperCase(), p);
  });
  console.log(`✅ Propiedades SIGYR cargadas: ${sigyrPropMap.size.toLocaleString()}`);

  // 2. Pagos aprobados en el nuevo sistema
  console.log('📂 Cargando pagos aprobados para protección...');
  const { data: pagos } = await supabase.from('pagos_reportados').select('identidad, detalles, estado').eq('estado', 'Aprobado');
  const paidInmCodes = new Set();
  const paidIdents = new Set();
  (pagos || []).forEach(p => {
    if (p.identidad) paidIdents.add(p.identidad.trim().toUpperCase());
    const det = JSON.stringify(p.detalles || '');
    const matches = det.match(/(URB|AURI)\d+/gi) || [];
    matches.forEach(m => paidInmCodes.add(m.toUpperCase()));
  });
  console.log(`🛡️ Inmuebles/contribuyentes con pagos protegidos: ${paidInmCodes.size} códigos`);

  // 3. Ajustar tabla `condominios`
  console.log('\n[Paso 1/2] Analizando tabla condominios...');
  const { data: condos, error: errC } = await supabase.from('condominios').select('*');
  if (errC) throw errC;

  const condoPlan = [];
  const condoMap = new Map();

  for (const c of condos) {
    condoMap.set(c.id, c);
    if (c.estado === 'Eliminado') continue;

    const code = String(c.codigo || '').trim().toUpperCase();
    const idClean = String(c.identidad || '').trim().toUpperCase();

    const hasPaid = paidInmCodes.has(code) || (idClean && paidIdents.has(idClean));
    if (hasPaid) continue; // Protegido

    const sigyr = sigyrPropMap.get(code);
    if (!sigyr) continue;

    const targetMonths = parseInt(String(sigyr.pending_months || 0), 10) || 0;
    const targetDate = pendienteDesdeParaMeses(targetMonths);
    const targetMultas = Math.max(0, targetMonths - 1);

    if (c.aseo_pendiente_desde !== targetDate || c.multa_meses !== targetMultas) {
      condoPlan.push({
        id: c.id,
        codigo: code,
        nombre: c.nombre,
        aseo_pendiente_desde: targetDate,
        multa_meses: targetMultas
      });
      // Actualizar memoria
      c.aseo_pendiente_desde = targetDate;
      c.multa_meses = targetMultas;
    }
  }

  console.log(`  -> Condominios a actualizar: ${condoPlan.length} de ${condos.length}`);

  // 4. Ajustar tabla `condominio_unidades`
  console.log('\n[Paso 2/2] Descargando y analizando tabla condominio_unidades...');
  let units = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('condominio_unidades')
      .select('id, condominio_id, inmueble, identidad, estado, aseo_pendiente_desde, multa_meses')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    units.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`  -> Total unidades en base de datos: ${units.length.toLocaleString()}`);

  const unitPlan = [];

  for (const u of units) {
    if (u.estado === 'Eliminada') continue;

    const code = String(u.inmueble || '').trim().toUpperCase();
    const idClean = String(u.identidad || '').trim().toUpperCase();

    const hasPaid = (code && paidInmCodes.has(code)) || (idClean && paidIdents.has(idClean));
    if (hasPaid) continue; // Protegido

    let targetDate = null;
    let targetMultas = 0;

    const sigyr = code ? sigyrPropMap.get(code) : null;
    if (sigyr) {
      const targetMonths = parseInt(String(sigyr.pending_months || 0), 10) || 0;
      targetDate = pendienteDesdeParaMeses(targetMonths);
      targetMultas = Math.max(0, targetMonths - 1);
    } else if (u.condominio_id && condoMap.has(u.condominio_id)) {
      const c = condoMap.get(u.condominio_id);
      if (c.modalidad === 'CENTRALIZADO') {
        targetDate = c.aseo_pendiente_desde;
        targetMultas = c.multa_meses || 0;
      }
    }

    if (u.aseo_pendiente_desde !== targetDate || u.multa_meses !== targetMultas) {
      unitPlan.push({
        id: u.id,
        inmueble: code,
        aseo_pendiente_desde: targetDate,
        multa_meses: targetMultas
      });
    }
  }

  console.log(`  -> Unidades a actualizar: ${unitPlan.length.toLocaleString()} de ${units.length.toLocaleString()}`);

  // 5. Guardar backup
  const backupFile = path.join(__dirname, `backup_condominios_sync_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ condoPlan, unitPlanCount: unitPlan.length }, null, 2));
  console.log(`💾 Backup guardado en: ${backupFile}`);

  // 6. Aplicar cambios a `condominios`
  console.log('\n🚀 Actualizando tabla condominios...');
  let condoUpdated = 0;
  for (const item of condoPlan) {
    const { error } = await supabase.from('condominios').update({
      aseo_pendiente_desde: item.aseo_pendiente_desde,
      multa_meses: item.multa_meses
    }).eq('id', item.id);
    if (!error) condoUpdated++;
    else console.error(`Error en condo ${item.codigo}:`, error.message);
  }
  console.log(`✅ Condominios actualizados: ${condoUpdated} / ${condoPlan.length}`);

  // 7. Aplicar cambios a `condominio_unidades` en lotes
  console.log('\n🚀 Actualizando tabla condominio_unidades en lotes de 100...');
  const BATCH_SIZE = 100;
  let unitUpdated = 0;
  let unitErrors = 0;

  for (let i = 0; i < unitPlan.length; i += BATCH_SIZE) {
    const chunk = unitPlan.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async item => {
        const { error } = await supabase.from('condominio_unidades').update({
          aseo_pendiente_desde: item.aseo_pendiente_desde,
          multa_meses: item.multa_meses
        }).eq('id', item.id);

        if (error) {
          unitErrors++;
        } else {
          unitUpdated++;
        }
      })
    );

    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= unitPlan.length) {
      const pct = Math.min(100, Math.round(((i + BATCH_SIZE) / unitPlan.length) * 100));
      console.log(`  -> Progreso unidades: ${Math.min(i + BATCH_SIZE, unitPlan.length)} / ${unitPlan.length} (${pct}%)`);
    }
  }

  console.log('\n================================================================');
  console.log(`✅ SINCRONIZACIÓN DE CONDOMINIOS COMPLETADA:`);
  console.log(`   Condominios matrices actualizados: ${condoUpdated}`);
  console.log(`   Unidades filiales actualizadas: ${unitUpdated.toLocaleString()}`);
  console.log(`   Errores: ${unitErrors}`);
  console.log('================================================================');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
