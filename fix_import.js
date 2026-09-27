require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching all from Supabase...');
  let allConts = [];
  let from = 0;
  const step = 1000;
  
  while (true) {
    const { data, error } = await supabase.from('contribuyentes').select('identidad').range(from, from + step - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allConts = allConts.concat(data);
    from += step;
  }
  
  const dbIds = new Set(allConts.map(c => c.identidad.replace(/\\D/g, '')));

  const file = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Record de deudas - 20260924180506.xlsx';
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Record de deudas'];
  const data = xlsx.utils.sheet_to_json(ws, { raw: false, header: 1 });
  
  const missingRows = [];
  for (let i=1; i<data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;
    const doc = row[2].toString().replace(/\\D/g, '');
    if (!dbIds.has(doc)) {
      missingRows.push(row);
    }
  }
  
  let contribuyentesToInsert = [];
  let inmueblesToInsert = [];
  let seenIds = new Set();
  
  missingRows.forEach(r => {
    const identidad = r[2].toString().trim();
    const cleanId = identidad.replace(/\\D/g, '');
    const nombre = r[3] ? r[3].toString().trim() : '';
    const telefono = r[5] ? r[5].toString().trim() : '';
    
    if (!seenIds.has(cleanId)) {
      contribuyentesToInsert.push({
        identidad: identidad,
        nombre_completo: nombre,
        telefono: telefono,
      });
      seenIds.add(cleanId);
    }
    
    const codigo = r[1] ? r[1].toString().trim() : null;
    const direccion = r[4] ? r[4].toString().trim() : '';
    const actividad = r[6] ? r[6].toString().trim() : '';
    const clasificacion = r[8] ? r[8].toString().trim() : 'Residencial';
    const esAgente = r[9] && r[9].toString().toUpperCase() === 'SÍ';
    const meses = parseInt(r[10]) || 0;
    
    if (codigo) {
      inmueblesToInsert.push({
        inmueble: codigo,
        identidad: identidad,
        contribuyente: nombre,
        tipo: clasificacion.toUpperCase(),
        actividad_principal: actividad,
        direccion: direccion,
        estado: 'Activo',
        cant_inmuebles: 1,
        clasificacion: clasificacion,
        agente_retencion: esAgente,
        meses_deuda: meses,
        deuda_congelada_bs: 0,
        multa_bs: 0,
        deuda_mmv: 0,
        telefono: telefono
      });
    }
  });

  const { error: e1 } = await supabase.from('contribuyentes').upsert(contribuyentesToInsert, { onConflict: 'identidad', ignoreDuplicates: true });
  if (e1) console.error('Error contribuyentes:', e1);
  else console.log('✅ Contribuyentes insertados.');

  for (let i = 0; i < inmueblesToInsert.length; i += 500) {
    const batch = inmueblesToInsert.slice(i, i + 500);
    const { error: e2 } = await supabase.from('inmuebles').upsert(batch, { onConflict: 'inmueble', ignoreDuplicates: true });
    if (e2) console.error('Error inmuebles:', e2);
  }
  console.log('✅ Inmuebles insertados.');
}
run();
