const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function aplicar() {
  console.log('======================================================================');
  console.log('🚀 APLICANDO SANEAMIENTO Y LIMPIEZA AUDITADA (SIGYR -> SUPABASE)');
  console.log('======================================================================\n');

  const sqlFile = '/Users/davidzara/Documents/naguanagua_zero/scripts_limpieza_segura_transaccion.sql';
  if (!fs.existsSync(sqlFile)) {
    console.error('No se encontró el archivo SQL:', sqlFile);
    return;
  }

  const content = fs.readFileSync(sqlFile, 'utf8');
  const lines = content.split('\n');

  // Separar por bloques
  const b1_updates = [];
  const b2_updates = [];
  const b3_updates = [];

  let currentBlock = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('1. CORRECCIÓN DE CÉDULAS')) { currentBlock = 1; continue; }
    if (trimmed.includes('2. RESTAURACIÓN DE ACTIVIDADES')) { currentBlock = 2; continue; }
    if (trimmed.includes('3. ARCHIVADO LÓGICO')) { currentBlock = 3; continue; }

    if (trimmed.startsWith('UPDATE inmuebles')) {
      if (currentBlock === 1) b1_updates.push(trimmed);
      else if (currentBlock === 2) b2_updates.push(trimmed);
      else if (currentBlock === 3) b3_updates.push(trimmed);
    }
  }

  console.log(`Operaciones identificadas en el script auditado:`);
  console.log(`  - Bloque 1 (Cédulas y RIFs cruzados): ${b1_updates.length}`);
  console.log(`  - Bloque 2 (Actividades N/A y Padres): ${b2_updates.length}`);
  console.log(`  - Bloque 3 (Archivado lógico de inactivos en SIGYR): ${b3_updates.length}`);
  console.log(`  -> Total sentencias a ejecutar: ${b1_updates.length + b2_updates.length + b3_updates.length}\n`);

  // 1. Extraer los IDs a modificar para generar RESPALDO PREVIO
  console.log('1. Generando respaldo de seguridad previo de las filas afectadas...');
  const idsToBackup = new Set();
  const allSqlLines = [...b1_updates, ...b2_updates, ...b3_updates];
  for (const sql of allSqlLines) {
    const m = sql.match(/WHERE id = '([a-f0-9\-]+)'/i);
    if (m) idsToBackup.add(m[1]);
  }

  const idsArray = Array.from(idsToBackup);
  console.log(`  -> Obteniendo snapshot de ${idsArray.length} inmuebles antes de los cambios...`);
  const backupRows = [];
  for (let i = 0; i < idsArray.length; i += 200) {
    const batch = idsArray.slice(i, i + 200);
    const { data, error } = await supabase.from('inmuebles').select('*').in('id', batch);
    if (error) throw error;
    backupRows.push(...data);
  }

  const backupPath = `/Users/davidzara/Documents/naguanagua_zero/backup_pre_limpieza_${Date.now()}.json`;
  fs.writeFileSync(backupPath, JSON.stringify(backupRows, null, 2), 'utf8');
  console.log(`  ✅ Respaldo de seguridad guardado en: ${backupPath}\n`);

  // 2. Ejecutar Bloque 1: Cédulas y RIFs
  console.log('2. Aplicando Bloque 1: Corrección de Cédulas/RIFs cruzados...');
  let b1_ok = 0;
  for (const sql of b1_updates) {
    // UPDATE inmuebles SET identidad = '...' WHERE id = '...' AND identidad = '...';
    const m = sql.match(/SET identidad = '([^']+)' WHERE id = '([^']+)' AND identidad = '([^']+)';/);
    if (m) {
      const [, newId, rowId, curId] = m;
      const { error } = await supabase.from('inmuebles').update({ identidad: newId }).eq('id', rowId).eq('identidad', curId);
      if (!error) b1_ok++;
      else console.error(`    Error en id ${rowId}:`, error.message);
    }
  }
  console.log(`  ✅ Bloque 1 completado: ${b1_ok} de ${b1_updates.length} filas actualizadas.\n`);

  // 3. Ejecutar Bloque 2: Actividades N/A y Padres
  console.log('3. Aplicando Bloque 2: Restauración de Actividades N/A y Padres...');
  let b2_ok = 0;
  for (const sql of b2_updates) {
    // Con padre: UPDATE inmuebles SET actividad_principal = '...', padre_id = '...' WHERE id = '...' AND actividad_principal = 'N/A';
    // Sin padre: UPDATE inmuebles SET actividad_principal = '...' WHERE id = '...' AND actividad_principal = 'N/A';
    const mPadre = sql.match(/SET actividad_principal = '([^']+)', padre_id = '([^']+)' WHERE id = '([^']+)' AND actividad_principal = 'N\/A';/);
    const mSin = sql.match(/SET actividad_principal = '([^']+)' WHERE id = '([^']+)' AND actividad_principal = 'N\/A';/);

    if (mPadre) {
      const [, act, padre, rowId] = mPadre;
      const { error } = await supabase.from('inmuebles').update({ actividad_principal: act, padre_id: padre }).eq('id', rowId).eq('actividad_principal', 'N/A');
      if (!error) b2_ok++;
      else console.error(`    Error en id ${rowId}:`, error.message);
    } else if (mSin) {
      const [, act, rowId] = mSin;
      const { error } = await supabase.from('inmuebles').update({ actividad_principal: act }).eq('id', rowId).eq('actividad_principal', 'N/A');
      if (!error) b2_ok++;
      else console.error(`    Error en id ${rowId}:`, error.message);
    }
  }
  console.log(`  ✅ Bloque 2 completado: ${b2_ok} de ${b2_updates.length} filas actualizadas.\n`);

  // 4. Ejecutar Bloque 3: Archivado Lógico de Inactivos
  console.log('4. Aplicando Bloque 3: Archivado lógico de inactivos/eliminados en SIGYR sin pagos...');
  let b3_ok = 0;
  for (const sql of b3_updates) {
    // UPDATE inmuebles SET estado = 'Eliminado' WHERE id = '...' AND estado = 'Activo';
    const m = sql.match(/WHERE id = '([^']+)' AND estado = 'Activo';/);
    if (m) {
      const [, rowId] = m;
      const { error } = await supabase.from('inmuebles').update({ estado: 'Eliminado' }).eq('id', rowId).eq('estado', 'Activo');
      if (!error) b3_ok++;
      else console.error(`    Error en id ${rowId}:`, error.message);
    }
  }
  console.log(`  ✅ Bloque 3 completado: ${b3_ok} de ${b3_updates.length} filas archivadas.\n`);

  console.log('======================================================================');
  console.log('🎉 SANEAMIENTO APLICADO CON ÉXITO:');
  console.log(`  - Cédulas/RIFs corregidos: ${b1_ok}`);
  console.log(`  - Actividades y Padres restaurados: ${b2_ok}`);
  console.log(`  - Inactivos archivados: ${b3_ok}`);
  console.log(`  - Respaldo previo: ${backupPath}`);
  console.log('======================================================================');
}

aplicar().catch(console.error);
