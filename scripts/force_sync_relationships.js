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

async function updateWithRetry(table, item, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const { error } = await supabase.from(table).update({ actividad_principal: item.actividad_principal }).eq('id', item.id);
    if (!error) return true;
    console.error(`\nError en intento ${i+1}: ${error.message}. Reintentando...`);
    await delay(2000); // Esperar 2 segundos antes de reintentar
  }
  return false;
}

async function runForceSync() {
  console.log("1. Parseando base de datos original...");
  const oldUsers = parseSqlValues('users');
  const oldProperties = parseSqlValues('properties');

  const userMap = new Map();
  oldUsers.forEach(u => {
    userMap.set(cleanString(u[0]), cleanString(u[1]));
  });

  const propById = new Map();
  oldProperties.forEach(p => {
    propById.set(cleanString(p[0]), p);
  });

  console.log("2. Consultando inmuebles existentes en Supabase...");
  let currentInmuebles = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, inmueble, actividad_principal').range(from, from + step - 1);
    if(error) break;
    if(data.length === 0) break;
    currentInmuebles = currentInmuebles.concat(data);
    from += step;
  }
  console.log(`-> Supabase tiene ${currentInmuebles.length} inmuebles en total.`);

  const supabaseInmueblesMap = new Map();
  currentInmuebles.forEach(r => {
    const baseCode = r.inmueble.split('-')[0];
    supabaseInmueblesMap.set(baseCode, r);
  });

  console.log("3. Evaluando relaciones Padre-Hijo...");
  
  const updates = [];
  oldProperties.forEach(p => {
    const urbaserCode = cleanString(p[10]);
    if (urbaserCode && supabaseInmueblesMap.has(urbaserCode)) {
      const supabaseRow = supabaseInmueblesMap.get(urbaserCode);
      const userId = cleanString(p[1]);
      const nombreUsuario = userMap.get(userId) || '';
      
      let expectedActividadPrincipal = '';
      const propertyUseId = cleanString(p[2]); // 2 = Condominio
      const propertyIdPadre = cleanString(p[22]);

      if (propertyUseId === '2') {
        expectedActividadPrincipal = `[CONDOMINIO] ${nombreUsuario}`;
      } else if (propertyIdPadre && propertyIdPadre !== '') {
        const padreData = propById.get(propertyIdPadre);
        if (padreData) {
          const padreCode = cleanString(padreData[10]);
          expectedActividadPrincipal = `[HIJO_DE:${padreCode}] [HIJO] ${nombreUsuario}`;
        }
      }

      if (expectedActividadPrincipal !== '' && supabaseRow.actividad_principal !== expectedActividadPrincipal) {
        updates.push({
          id: supabaseRow.id,
          inmueble: supabaseRow.inmueble,
          actividad_principal: expectedActividadPrincipal
        });
      }
    }
  });

  console.log(`-> Se van a corregir/sincronizar ${updates.length} inmuebles huerfanos o mal etiquetados.`);

  if (updates.length > 0) {
    console.log("4. Aplicando actualizaciones en Supabase...");
    let total = 0;
    
    // Batch updates in small chunks sequentially to avoid connection limits
    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50);
      const promises = chunk.map(item => updateWithRetry('inmuebles', item));
      await Promise.all(promises);
      total += chunk.length;
      process.stdout.write(`.${total}`);
    }
    console.log(`\n¡${total} registros actualizados forzosamente!`);
  } else {
    console.log("No hay inmuebles que requieran sincronización.");
  }
}

runForceSync();
