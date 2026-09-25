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

async function runImport() {
  console.log("1. Parseando base de datos original...");
  const oldUsers = parseSqlValues('users');
  const oldProperties = parseSqlValues('properties');

  const userMap = new Map();
  oldUsers.forEach(u => {
    userMap.set(cleanString(u[0]), {
      nombre: cleanString(u[1]),
      email: cleanString(u[3]),
      telefono: cleanString(u[7]),
      documento: cleanString(u[9]),
      direccion: cleanString(u[19])
    });
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
    const { data, error } = await supabase.from('inmuebles').select('inmueble, actividad_principal').range(from, from + step - 1);
    if(error) break;
    if(data.length === 0) break;
    currentInmuebles = currentInmuebles.concat(data);
    from += step;
  }

  const existingCodes = new Set();
  currentInmuebles.forEach(r => {
    const baseCode = r.inmueble.split('-')[0];
    existingCodes.add(baseCode);
    if (r.actividad_principal && r.actividad_principal.includes('[HIJO_DE:')) {
      const match = r.actividad_principal.match(/\\[HIJO_DE:(.*?)\\]/);
      if (match) {
        existingCodes.add(match[1]);
      }
    }
  });

  const newContribuyentes = [];
  const newInmuebles = [];
  
  console.log("3. Extrayendo propiedades faltantes y construyendo jerarquías...");
  
  oldProperties.forEach(p => {
    const urbaserCode = cleanString(p[10]);
    
    if (urbaserCode && !existingCodes.has(urbaserCode)) {
      const userId = cleanString(p[1]);
      const userData = userMap.get(userId) || {};
      
      let doc = userData.documento;
      if (!doc || doc === '0' || doc.toLowerCase() === 'sn') {
        doc = urbaserCode;
      }
      
      if (!newContribuyentes.find(c => c.identidad === doc)) {
        newContribuyentes.push({
          identidad: doc,
          nombre: userData.nombre || 'N/A',
          email: userData.email || 'N/A',
          telefono: userData.telefono || 'N/A',
          direccion: userData.direccion || 'Recuperado de histórico'
        });
      }

      let actividadPrincipal = 'N/A';
      const propertyUseId = cleanString(p[2]); // 2 = Condominio
      const propertyIdPadre = cleanString(p[22]);

      if (propertyUseId === '2') {
        actividadPrincipal = `[CONDOMINIO] ${userData.nombre || ''}`;
      } else if (propertyIdPadre && propertyIdPadre !== '') {
        const padreData = propById.get(propertyIdPadre);
        if (padreData) {
          const padreCode = cleanString(padreData[10]);
          actividadPrincipal = `[HIJO_DE:${padreCode}] [HIJO] ${userData.nombre || ''}`;
        }
      }

      newInmuebles.push({
        inmueble: urbaserCode,
        identidad: doc,
        actividad_principal: actividadPrincipal,
        estado: 'Activo',
        deuda_mmv: 0,
        saldo_favor_bs: 0
      });
    }
  });

  async function insertInChunks(table, dataArray, conflictField) {
    let chunks = [];
    for(let i = 0; i < dataArray.length; i += 500) {
      chunks.push(dataArray.slice(i, i + 500));
    }
    
    let total = 0;
    for(let chunk of chunks) {
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflictField, ignoreDuplicates: true });
      if (error) {
        console.error(`Error insertando en ${table}:`, error.message);
      } else {
        total += chunk.length;
        process.stdout.write(`.${total}`);
      }
    }
    console.log(`\n¡${total} registros insertados en ${table}!`);
  }

  if (newInmuebles.length > 0) {
    console.log("5. Insertando Inmuebles en Supabase...");
    await insertInChunks('inmuebles', newInmuebles, 'inmueble');
  }
  
  console.log("¡Proceso de importación masiva COMPLETADO!");
}

runImport();
