const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sqlContent = fs.readFileSync('/Users/davidzara/Documents/naguanagua_zero/documentos/filtered_naguanagua_data.sql', 'utf8');

function cleanString(str) {
  if (!str || str === 'NULL') return '';
  return str.replace(/^'(.*)'$/, '$1').trim();
}

function parseSqlValues(tableName) {
  const records = [];
  const regex = new RegExp(`INSERT INTO public."${tableName}".*?VALUES\\s*([\\s\\S]*?);`, 'g');
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    const valuesString = match[1];
    let inString = false;
    let currentTuple = [];
    let currentVal = '';
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      if (char === "'" && !inString) {
        inString = true;
      } else if (char === "'" && inString) {
        if (valuesString[i+1] === "'") {
          currentVal += "'";
          i++;
        } else {
          inString = false;
        }
      } else if (char === ',' && !inString) {
         currentTuple.push(currentVal.trim());
         currentVal = '';
      } else if (char === ')' && !inString) {
         currentTuple.push(currentVal.trim());
         records.push(currentTuple);
         currentTuple = [];
         currentVal = '';
         while(i + 1 < valuesString.length && valuesString[i+1] !== '(') i++;
         if (i + 1 < valuesString.length && valuesString[i+1] === '(') i++;
      } else if (char === '(' && !inString && currentTuple.length === 0 && currentVal.trim() === '') {
      } else {
         currentVal += char;
      }
    }
  }
  return records;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function runMergeNietos() {
  console.log("1. Leyendo relaciones del dump SQL viejo...");
  const properties = parseSqlValues('properties');
  
  const propMap = new Map();
  const condominiosIds = new Set();

  properties.forEach(p => {
      const id = cleanString(p[0]);
      propMap.set(id, p);
      if (cleanString(p[2]) === '2') { // propertyUseId == 2 (Condominio)
          condominiosIds.add(id);
      }
  });

  const parentToNietos = new Map(); // parent_urb_code -> [{ nietoUrb, nietoAct }]

  properties.forEach(p => {
      const parentId = cleanString(p[22]);
      if (parentId && parentId !== '' && parentId !== 'NULL' && parentId !== '0') {
          if (!condominiosIds.has(parentId)) {
              // Es un Nieto! Su padre NO es un condominio.
              const parentRow = propMap.get(parentId);
              if (parentRow) {
                  const parentUrb = cleanString(parentRow[10]);
                  const nietoUrb = cleanString(p[10]);
                  const nietoAct = cleanString(p[4]);
                  
                  if (!parentToNietos.has(parentUrb)) {
                      parentToNietos.set(parentUrb, []);
                  }
                  parentToNietos.get(parentUrb).push({
                      nietoUrb,
                      nietoAct
                  });
              }
          }
      }
  });

  console.log(`-> Se encontraron ${parentToNietos.size} inmuebles Padres que tienen Nietos.`);

  console.log("2. Descargando inmuebles de Supabase...");
  let allInmuebles = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, inmueble, actividad_economica_id').range(from, from + step - 1);
    if(error || !data || data.length === 0) break;
    allInmuebles = allInmuebles.concat(data);
    from += step;
  }
  
  const supabaseInmMap = new Map();
  allInmuebles.forEach(inm => {
      const baseUrb = inm.inmueble.split('-')[0];
      if (!supabaseInmMap.has(baseUrb)) supabaseInmMap.set(baseUrb, []);
      supabaseInmMap.get(baseUrb).push(inm);
  });

  console.log("3. Ejecutando Fusión (Merge) y Eliminación de Nietos...");
  
  let mergedCount = 0;
  let deletedCount = 0;

  for (const [parentUrb, nietos] of parentToNietos.entries()) {
      const parentSupabaseRows = supabaseInmMap.get(parentUrb);
      if (!parentSupabaseRows || parentSupabaseRows.length === 0) continue;
      
      const parentRow = parentSupabaseRows[0];
      let currentActs = [];
      if (parentRow.actividad_economica_id && parentRow.actividad_economica_id !== '0' && parentRow.actividad_economica_id !== 'NULL') {
          currentActs = String(parentRow.actividad_economica_id).split(',');
      }
      
      let nietoUrbCodesToDelete = [];
      nietos.forEach(nieto => {
          if (nieto.nietoAct && nieto.nietoAct !== '0' && nieto.nietoAct !== 'NULL') {
              if (!currentActs.includes(nieto.nietoAct)) {
                  currentActs.push(nieto.nietoAct);
              }
          }
          nietoUrbCodesToDelete.push(nieto.nietoUrb);
      });
      
      const newActsString = currentActs.join(',');
      
      // Actualizar al Padre
      const { error: updErr } = await supabase.from('inmuebles').update({ actividad_economica_id: newActsString }).eq('id', parentRow.id);
      if (!updErr) mergedCount++;
      
      // Eliminar a los Nietos
      for (const nietoUrb of nietoUrbCodesToDelete) {
          const nietoSupabaseRows = supabaseInmMap.get(nietoUrb);
          if (nietoSupabaseRows) {
              for (const nRow of nietoSupabaseRows) {
                  const { error: delErr } = await supabase.from('inmuebles').delete().eq('id', nRow.id);
                  if (!delErr) deletedCount++;
              }
          }
      }
  }

  console.log(`\n¡Fusión completada!`);
  console.log(`- Inmuebles Padres actualizados con múltiples actividades: ${mergedCount}`);
  console.log(`- Inmuebles Nietos eliminados de la base de datos: ${deletedCount}`);
}

runMergeNietos();
