/**
 * FASE M4/M5: Importar actividades económicas, notas de crédito, y rutas
 * desde los TSV extraídos del dump de 40GB
 * 
 * Columnas de cada tabla (del COPY):
 * 
 * economic_activities: id, name, created_at, updated_at, deleted_at, size, tax_free, property_type_id, institution_id, code, hidden
 * credit_notes: id, property_id, amount, status, created_at, updated_at, deleted_at, voided_at (+ más)
 * routes: id, route_type, route_number, monday, tuesday, wednesday, thursday, friday, saturday, sunday, turn, description, hour, created_at, updated_at, deleted_at
 * prices: id, economic_activity_id, service_type_id, commercial_factor, additional_coefficient, adjustment_factor, created_at, updated_at, deleted_at, commercial_factor_2024_1, commercial_factor_2024_2, commercial_factor_2025_1
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = '', SUPABASE_KEY = '';
try {
  const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
  SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || '';
} catch(e) {}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const EXTRACTED = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/extracted';

function readTSV(filename) {
  const filepath = path.join(EXTRACTED, filename);
  if (!fs.existsSync(filepath)) return [];
  return fs.readFileSync(filepath, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(line => line.split('\t').map(v => v === '\\N' ? null : v));
}

(async () => {
  console.log('📦 FASE M4/M5: Importar datos extraídos del dump\n');
  
  // ── 1. Actividades Económicas ──
  console.log('1. Actividades Económicas...');
  const eaRows = readTSV('economic_activities.tsv');
  console.log(`   ${eaRows.length} actividades`);
  
  // Verificar si ya existe la tabla actividades_economicas
  const { data: existingEA } = await supabase.from('actividades_economicas').select('id').limit(1);
  
  if (existingEA !== null) {
    // Table exists, check count
    const { count } = await supabase.from('actividades_economicas').select('id', {count:'exact',head:true});
    console.log(`   Ya existen ${count || 0} actividades en Supabase`);
    
    if ((count || 0) < eaRows.length) {
      // Insert missing
      const batch = eaRows.map(r => ({
        id: parseInt(r[0]),
        nombre: r[1],
        codigo: r[10] || r[0],
        tipo_inmueble: r[7] === '1' ? 'Comercial' : r[7] === '2' ? 'Residencial' : 'Industrial',
        factor_operativo: parseFloat(r[5]) || 0,
        exento_iva: r[6] === '1' || r[6] === 't',
      }));
      
      for (let i = 0; i < batch.length; i += 100) {
        const chunk = batch.slice(i, i + 100);
        const { error } = await supabase.from('actividades_economicas').upsert(chunk, { onConflict: 'id' });
        if (error) console.log(`   ⚠️ Error batch ${i}:`, error.message);
      }
      console.log(`   ✅ Actividades importadas`);
    }
  } else {
    console.log('   ⚠️ Tabla actividades_economicas no existe. Guardando como JSON de referencia.');
    const eaData = eaRows.map(r => ({
      id: parseInt(r[0]),
      nombre: r[1],
      codigo: r[10] || r[0],
      tipo_inmueble_id: r[7],
      factor_operativo: parseFloat(r[5]) || 0,
      exento_iva: r[6] === '1' || r[6] === 't',
    }));
    fs.writeFileSync(path.join(EXTRACTED, 'actividades_economicas.json'), JSON.stringify(eaData, null, 2));
    console.log(`   ✅ Guardado como actividades_economicas.json (${eaData.length} registros)`);
  }
  
  // ── 2. Precios / Tarifas ──
  console.log('\n2. Precios / Tarifas...');
  const priceRows = readTSV('prices.tsv');
  console.log(`   ${priceRows.length} precios`);
  // prices: id, economic_activity_id, service_type_id, commercial_factor, additional_coefficient, adjustment_factor, ...
  const pricesData = priceRows.map(r => ({
    id: parseInt(r[0]),
    actividad_economica_id: parseInt(r[1]),
    factor_comercial: parseFloat(r[3]) || 0,
    coeficiente_adicional: parseFloat(r[4]) || 0,
    factor_ajuste: parseFloat(r[5]) || 0,
    factor_2024_1: parseFloat(r[9]) || 0,
    factor_2024_2: parseFloat(r[10]) || 0,
    factor_2025_1: parseFloat(r[11]) || 0,
  }));
  fs.writeFileSync(path.join(EXTRACTED, 'precios.json'), JSON.stringify(pricesData, null, 2));
  console.log(`   ✅ Guardado como precios.json`);
  
  // ── 3. Notas de Crédito → Saldo a favor en inmuebles ──
  console.log('\n3. Notas de Crédito...');
  const cnRows = readTSV('credit_notes.tsv');
  console.log(`   ${cnRows.length} notas de crédito`);
  // credit_notes: id, property_id, amount, status, created_at, ...
  
  // Aggregate by property_id: sum of amounts where status = active (0 or similar)
  const saldoByProperty = {};
  for (const r of cnRows) {
    const propId = r[1];
    const amount = parseFloat(r[2]) || 0;
    const status = r[3]; // 0=active, 1=used, etc.
    if (amount > 0 && (status === '0' || status === null)) {
      saldoByProperty[propId] = (saldoByProperty[propId] || 0) + amount;
    }
  }
  
  const propsWithCredit = Object.keys(saldoByProperty).length;
  console.log(`   Propiedades con saldo a favor: ${propsWithCredit}`);
  
  // We need to map property_id → user → identidad → Supabase inmueble
  // Load the property→user mapping from the filtered SQL
  const sqlPath = '/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql';
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  // Quick property_id → user_id mapping from properties
  const propToUser = {};
  const propBlocks = sql.match(/INSERT INTO public\."properties"[^;]+;/g) || [];
  for (const block of propBlocks) {
    // Quick regex for id and user_id
    const re = /\((\d+),\s*(\d+),/g;
    let m;
    const startIdx = block.indexOf('VALUES');
    const valBlock = block.substring(startIdx);
    // Each tuple starts with (prop_id, user_id, ...
    const tupleRe = /\((\d+),\s*(\d+)/g;
    while ((m = tupleRe.exec(valBlock)) !== null) {
      propToUser[m[1]] = m[2];
    }
  }
  
  // user_id → document
  const userBlocks = sql.match(/INSERT INTO public\."users"[^;]+;/g) || [];
  const userIdToDoc = {};
  for (const block of userBlocks) {
    const re = /\((\d+),\s*'[^']*'(?:,\s*(?:'[^']*'|NULL)){6},\s*\d+,\s*(?:'([^']*)'|NULL)/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      if (m[2] && m[2] !== '0') userIdToDoc[m[1]] = m[2];
    }
  }
  
  // Load Supabase inmuebles
  console.log('   Cargando inmuebles...');
  const allInm = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('inmuebles').select('id, identidad').range(from, from + 999);
    if (!data || data.length === 0) break;
    allInm.push(...data);
    from += 1000;
  }
  
  const byDoc = {};
  allInm.forEach(i => {
    if (i.identidad) {
      const k = i.identidad.replace(/-/g, '').toUpperCase();
      if (!byDoc[k]) byDoc[k] = [];
      byDoc[k].push(i);
    }
  });
  
  // Update saldo_favor_bs
  console.log('   Actualizando saldos a favor...');
  let updatedSaldo = 0;
  const propIds = Object.keys(saldoByProperty);
  
  for (let i = 0; i < propIds.length; i += 10) {
    const batch = propIds.slice(i, i + 10);
    const promises = batch.map(async (propId) => {
      const userId = propToUser[propId];
      if (!userId) return;
      const doc = userIdToDoc[userId];
      if (!doc) return;
      
      const targets = byDoc[doc.replace(/-/g, '').toUpperCase()];
      if (!targets?.length) return;
      
      const saldo = saldoByProperty[propId];
      const { error } = await supabase.from('inmuebles').update({
        saldo_favor_bs: saldo,
      }).eq('id', targets[0].id);
      if (!error) updatedSaldo++;
    });
    await Promise.all(promises);
    if (i % 500 === 0) process.stdout.write(`   Saldo: ${Math.min(i+10, propIds.length)}/${propIds.length}\r`);
  }
  console.log(`\n   ✅ Saldos actualizados: ${updatedSaldo}`);
  
  // ── 4. Rutas ──
  console.log('\n4. Rutas de recolección...');
  const routeRows = readTSV('routes.tsv');
  console.log(`   ${routeRows.length} rutas`);
  const routesData = routeRows.map(r => ({
    id: parseInt(r[0]),
    tipo: r[1],
    numero: r[2],
    lunes: r[3] === 't',
    martes: r[4] === 't',
    miercoles: r[5] === 't',
    jueves: r[6] === 't',
    viernes: r[7] === 't',
    sabado: r[8] === 't',
    domingo: r[9] === 't',
    turno: r[10],
    descripcion: r[11],
    hora: r[12],
  }));
  fs.writeFileSync(path.join(EXTRACTED, 'rutas.json'), JSON.stringify(routesData, null, 2));
  console.log(`   ✅ Guardado como rutas.json`);
  
  // ── 5. Resumen de facturas (bills) ──
  console.log('\n5. Resumen de facturas...');
  const billRows = readTSV('bills.tsv');
  console.log(`   ${billRows.length} facturas totales`);
  
  // Contar por estado
  // bills: id, property_id, amount, iva, total, created_at, updated_at, ...
  const billStats = { total: billRows.length };
  fs.writeFileSync(path.join(EXTRACTED, 'bills_summary.json'), JSON.stringify({
    total_facturas: billRows.length,
    total_pagos: readTSV('bill_payments.tsv').length,
    total_detalles: readTSV('bill_details.tsv').length,
    total_notas_credito: cnRows.length,
    total_notas_credito_bills: readTSV('bill_credit_notes.tsv').length,
    nota: 'Estos datos están disponibles en TSV para importación futura si se crea tabla de facturas en Supabase',
  }, null, 2));
  console.log(`   ✅ Resumen guardado`);
  
  // ── Stats finales ──
  console.log('\n\n📊 ESTADÍSTICAS FINALES');
  console.log('======================');
  const { count: cSaldo } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).gt('saldo_favor_bs',0);
  const { count: cTotal } = await supabase.from('inmuebles').select('id',{count:'exact',head:true});
  const { count: cCondo } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).eq('es_condominio',true);
  const { count: cHijos } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('condominio_padre_id','is',null);
  const { count: cNotas } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('notas','is',null);
  const { count: cCorreo } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).not('correo_electronico','is',null);
  const { count: cDeuda } = await supabase.from('inmuebles').select('id',{count:'exact',head:true}).gt('deuda_mmv',0);
  
  console.log(`Total inmuebles: ${cTotal}`);
  console.log(`Con deuda: ${cDeuda}`);
  console.log(`Condominios: ${cCondo}`);
  console.log(`Hijos vinculados: ${cHijos}`);
  console.log(`Con notas: ${cNotas}`);
  console.log(`Con correo: ${cCorreo}`);
  console.log(`Con saldo a favor: ${cSaldo}`);
  console.log(`\nDatos extraídos disponibles:`);
  console.log(`  892 actividades económicas`);
  console.log(`  1,073 precios/tarifas`);
  console.log(`  166,720 facturas`);
  console.log(`  480,052 pagos`);
  console.log(`  132,681 notas de crédito`);
  console.log(`  29 rutas de recolección`);
  
  console.log('\n✅ FASES M4/M5 COMPLETADAS');
})();
