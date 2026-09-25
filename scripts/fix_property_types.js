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
async function updateWithRetry(table, idField, idValue, payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const { error } = await supabase.from(table).update(payload).eq(idField, idValue);
    if (!error) return true;
    console.error(`Error en intento ${i+1} (${idValue}): ${error.message}. Reintentando...`);
    await delay(1000);
  }
  return false;
}

async function fixTypes() {
  console.log("Extrayendo propiedades...");
  const oldProperties = parseSqlValues('properties');
  
  const propertyUpdatesMap = new Map();
  
  oldProperties.forEach(p => {
    if (!p || p.length < 15) return;
    const urbaserCode = cleanString(p[10]);
    if (!urbaserCode) return;
    
    const isCondo = cleanString(p[5]) === '1';
    const isChild = urbaserCode.includes('-');
    
    // property_type_id: 1 = Comercial, 2 = Residencial
    const propertyTypeId = cleanString(p[3]);
    let tipo = 'INDEPENDIENTE';
    if (propertyTypeId === '1') tipo = 'COMERCIAL';
    else if (propertyTypeId === '2') tipo = 'RESIDENCIAL';
    
    if (isCondo && urbaserCode.endsWith('0') && !isChild) tipo = 'CONDOMINIO';
    
    if (!propertyUpdatesMap.has(urbaserCode)) {
      propertyUpdatesMap.set(urbaserCode, {
        urbaserCode,
        payload: { tipo }
      });
    }
  });

  const propertyUpdates = Array.from(propertyUpdatesMap.values());
  console.log(`-> Actualizando ${propertyUpdates.length} inmuebles en Supabase...`);
  
  let totalProp = 0;
  for (let i = 0; i < propertyUpdates.length; i += 25) {
    const chunk = propertyUpdates.slice(i, i + 25);
    const promises = chunk.map(item => updateWithRetry('inmuebles', 'inmueble', item.urbaserCode, item.payload));
    await Promise.all(promises);
    totalProp += chunk.length;
    process.stdout.write(`.${totalProp}`);
  }
  
  console.log(`\n¡${totalProp} tipos de inmuebles corregidos!`);
}

fixTypes();
