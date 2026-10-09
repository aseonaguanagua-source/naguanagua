const xlsx = require('xlsx');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

const debtMap = {}; // codigo -> { meses, multas }

// 1. Parse Master Condominios
const masterFile = path.join(__dirname, 'Master_Condominios_Naguanagua.xlsx');
try {
  const wb1 = xlsx.readFile(masterFile);
  const data1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]], { header: 1 });
  for (let i = 6; i < data1.length; i++) {
    const row = data1[i];
    if (!row || row.length < 10) continue;
    const codigo = String(row[0] || '').trim().toUpperCase();
    if (!codigo || codigo === 'CÓDIGO') continue;
    debtMap[codigo] = {
      meses: parseInt(row[6]) || 0,
      multas: parseInt(row[9]) || 0,
      source: 'Master'
    };
  }
} catch (e) { console.log('Error reading Master:', e.message); }

// 2. Parse Record de Deudas
const recordFile = path.join(__dirname, 'Record de deudas - 20260924180506 (1).xlsx');
try {
  const wb2 = xlsx.readFile(recordFile);
  const sheet2 = wb2.Sheets[wb2.SheetNames[1]]; // second sheet
  const data2 = xlsx.utils.sheet_to_json(sheet2, { header: 1 });
  for (let i = 1; i < data2.length; i++) {
    const row = data2[i];
    if (!row || row.length < 10) continue;
    const codigo = String(row[1] || '').trim().toUpperCase();
    if (!codigo || codigo === 'CÓDIGO' || debtMap[codigo]) continue;
    const meses = parseInt(row[10]) || 0;
    debtMap[codigo] = {
      meses: meses,
      multas: Math.max(0, meses - 1),
      source: 'Record'
    };
  }
} catch (e) { console.log('Error reading Record:', e.message); }

function calculateBaseDate(meses) {
  if (meses <= 0) return '2026-10-01'; // Solvente (September paid)
  const d = new Date(2026, 8, 1); // Sept 2026
  d.setMonth(d.getMonth() - (meses - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

async function getAllRows(table, select, filters = []) {
  let all = [];
  let step = 1000;
  for (let start = 0; ; start += step) {
    let q = sb.from(table).select(select).range(start, start + step - 1);
    for (const f of filters) q = q[f.method](...f.args);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < step) break;
  }
  return all;
}

async function run() {
  console.log(`[1] Loaded ${Object.keys(debtMap).length} unique codes from Excels.`);

  // Get active units from condominio_unidades
  const dbUnits = await getAllRows('condominio_unidades', 'id, inmueble, estado, aseo_pendiente_desde, multa_meses', [
    { method: 'neq', args: ['estado', 'Eliminada'] }
  ]);
  console.log(`[2] Found ${dbUnits.length} active units in condominio_unidades.`);

  const unitUpdates = [];
  for (const unit of dbUnits) {
    if (!unit.inmueble) continue;
    const excelData = debtMap[unit.inmueble];
    if (!excelData) continue; 
    
    const finalDate = calculateBaseDate(excelData.meses);
    const finalMultas = excelData.multas;
    
    if (unit.aseo_pendiente_desde !== finalDate || unit.multa_meses !== finalMultas) {
      unitUpdates.push({
        id: unit.id,
        inmueble: unit.inmueble,
        old_date: unit.aseo_pendiente_desde,
        new_date: finalDate,
        old_multas: unit.multa_meses,
        new_multas: finalMultas
      });
    }
  }

  console.log(`[3] Updating ${unitUpdates.length} records in condominio_unidades...`);
  let updatedUnits = 0;
  for (let i = 0; i < unitUpdates.length; i++) {
    const u = unitUpdates[i];
    await sb.from('condominio_unidades').update({
      aseo_pendiente_desde: u.new_date,
      multa_meses: u.new_multas
    }).eq('id', u.id);
    updatedUnits++;
    if (updatedUnits % 100 === 0) console.log(`  ... ${updatedUnits}/${unitUpdates.length}`);
  }

  // Same for inmuebles
  const dbInmuebles = await getAllRows('inmuebles', 'id, inmueble, estado, meses_deuda, deuda_congelada_bs', [
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);
  console.log(`[4] Found ${dbInmuebles.length} active records in inmuebles.`);

  const inmUpdates = [];
  for (const inm of dbInmuebles) {
    if (!inm.inmueble) continue;
    const excelData = debtMap[inm.inmueble];
    if (!excelData) continue;
    // Inmuebles uses `meses_deuda` instead of date.
    // Excel gives `meses`. So we can set `meses_deuda` directly!
    // But wait, the system also uses `created_at` or `meses_deuda` dynamically?
    // The codebase calculates debt usually dynamically. Let's update `meses_deuda` for now to force it.
    
    if (inm.meses_deuda !== excelData.meses) {
      inmUpdates.push({
         id: inm.id,
         inmueble: inm.inmueble,
         old_meses: inm.meses_deuda,
         new_meses: excelData.meses
      });
    }
  }
  
  console.log(`[5] Updating ${inmUpdates.length} records in inmuebles...`);
  let updatedInmuebles = 0;
  for (let i = 0; i < inmUpdates.length; i++) {
    const u = inmUpdates[i];
    await sb.from('inmuebles').update({
      meses_deuda: u.new_meses
    }).eq('id', u.id);
    updatedInmuebles++;
    if (updatedInmuebles % 500 === 0) console.log(`  ... ${updatedInmuebles}/${inmUpdates.length}`);
  }

  // Clean duplicates in condominio_unidades
  console.log('[6] Checking for duplicates in condominio_unidades...');
  const grouped = {};
  for (const u of dbUnits) {
    if (!u.inmueble) continue;
    if (!grouped[u.inmueble]) grouped[u.inmueble] = [];
    grouped[u.inmueble].push(u);
  }
  let dupsRemoved = 0;
  for (const [inmueble, list] of Object.entries(grouped)) {
    if (list.length > 1) {
       list.sort((a,b) => (a.estado === 'Activa' ? -1 : 1));
       for (let i = 1; i < list.length; i++) {
          await sb.from('condominio_unidades').delete().eq('id', list[i].id);
          dupsRemoved++;
       }
    }
  }
  console.log(`Removed ${dupsRemoved} duplicate rows in condominio_unidades.`);

  console.log('DONE!');
}

run();
