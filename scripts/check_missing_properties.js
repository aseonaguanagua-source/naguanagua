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
  if (!str) return '';
  if (str === 'NULL') return '';
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

async function checkMissing() {
  const oldProperties = parseSqlValues('properties');

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

  // Create sets of pure codes
  const supabaseCodes = new Set();
  currentInmuebles.forEach(r => {
    // Si tiene guion (ej URB000-V123), extraer lo antes del guion
    const baseCode = r.inmueble.split('-')[0];
    supabaseCodes.add(baseCode);
    
    // Si es padre, el código del padre está en inmueble o en actividad_principal "[HIJO_DE:CODE]"
    if (r.actividad_principal && r.actividad_principal.includes('[HIJO_DE:')) {
      const match = r.actividad_principal.match(/\\[HIJO_DE:(.*?)\\]/);
      if (match) {
        supabaseCodes.add(match[1]);
      }
    }
  });

  let missingCount = 0;
  let missingCodes = [];
  oldProperties.forEach(p => {
    const urbaserCode = cleanString(p[10]);
    if (urbaserCode && !supabaseCodes.has(urbaserCode)) {
      missingCount++;
      missingCodes.push(urbaserCode);
    }
  });

  console.log(`Inmuebles totalmente faltantes en Supabase: ${missingCount}`);
  if (missingCodes.includes('URB016119')) {
    console.log("¡URB016119 (Sambil) efectivamente falta en la base de datos de Supabase!");
  } else {
    console.log("URB016119 SI EXISTE en alguna parte de Supabase.");
  }
}

checkMissing();
