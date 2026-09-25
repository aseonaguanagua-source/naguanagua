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

async function runFullSync() {
  console.log("1. Extrayendo diccionarios base...");
  
  // Document Types map
  const rawDocTypes = parseSqlValues('document_types');
  const docTypeMap = new Map();
  // 0: id, 1: name (usually V, J, E, G, P, C...)
  if (rawDocTypes.length === 0) {
    console.log("No document_types found, using standard mappings.");
    docTypeMap.set('1', 'V');
    docTypeMap.set('2', 'J');
    docTypeMap.set('3', 'E');
    docTypeMap.set('4', 'G');
    docTypeMap.set('5', 'P');
    docTypeMap.set('6', 'C');
  } else {
    rawDocTypes.forEach(r => docTypeMap.set(cleanString(r[0]), cleanString(r[1])));
  }

  // Phone Codes map
  const rawPhoneCodes = parseSqlValues('phone_codes');
  const phoneCodeMap = new Map();
  // 0: id, 1: code (e.g. 0414)
  if (rawPhoneCodes.length === 0) {
    phoneCodeMap.set('1', '0412');
    phoneCodeMap.set('2', '0414');
    phoneCodeMap.set('3', '0424');
    phoneCodeMap.set('4', '0416');
    phoneCodeMap.set('5', '0426');
    phoneCodeMap.set('6', '0241');
  } else {
    rawPhoneCodes.forEach(r => phoneCodeMap.set(cleanString(r[0]), cleanString(r[1])));
  }
  
  console.log("2. Procesando Usuarios (Contribuyentes)...");
  const oldUsers = parseSqlValues('users');
  /*
    Indices users:
    0: id
    1: name
    2: lastname
    3: email
    5: level_id
    6: phone_code_id
    7: phone
    8: document_type_id
    9: document
    17: economic_activity
    18: business_name
    19: fiscal_address
  */
  
  const userUpdates = [];
  oldUsers.forEach(u => {
    if (!u || u.length < 10) return;
    const docTypeId = cleanString(u[8]);
    const docNum = cleanString(u[9]);
    const prefix = docTypeMap.get(docTypeId) || 'V';
    const cleanPrefix = prefix.replace(/[^A-Za-z]/g, '').toUpperCase();
    const identidadCompleta = `${cleanPrefix}-${docNum}`;
    
    let nombre = cleanString(u[1]);
    let lastname = cleanString(u[2]);
    let fullName = `${nombre} ${lastname}`.trim();
    let businessName = u[18] ? cleanString(u[18]) : '';
    if (businessName && businessName !== '') fullName = businessName;
    
    let email = cleanString(u[3]);
    let phoneCodeId = cleanString(u[6]);
    let phoneNum = cleanString(u[7]);
    let phonePrefix = phoneCodeMap.get(phoneCodeId) || '';
    let telefono = phoneNum ? `${phonePrefix}${phoneNum}` : '';
    
    let fiscalAddress = u[19] ? cleanString(u[19]) : '';
    
    userUpdates.push({
      identidad: identidadCompleta,
      payload: {
        nombre: fullName,
        email: email,
        telefono: telefono,
        direccion: fiscalAddress
      }
    });
  });

  console.log(`-> ${userUpdates.length} usuarios parseados. Actualizando en Supabase...`);
  
  let totalUsr = 0;
  for (let i = 0; i < userUpdates.length; i += 25) {
    const chunk = userUpdates.slice(i, i + 25);
    const promises = chunk.map(item => updateWithRetry('contribuyentes', 'identidad', item.identidad, item.payload));
    await Promise.all(promises);
    totalUsr += chunk.length;
    process.stdout.write(`.${totalUsr}`);
  }
  console.log(`\n¡${totalUsr} contribuyentes actualizados!`);
  
  console.log("\n3. Procesando Inmuebles (Propiedades)...");
  const oldProperties = parseSqlValues('properties');
  /*
    Indices properties:
    0: id
    1: user_id
    2: property_use_id
    3: property_type_id
    4: economic_activity_id
    5: condominium (0 or 1)
    6: owner
    7: catastral_id
    10: urbaser_code
    13: zone
    14: street
    15: house_number
    16: floor
    17: reference
  */
  
  const propertyUpdatesMap = new Map(); // using map to merge multiple activities for same local
  
  oldProperties.forEach(p => {
    if (!p || p.length < 15) return;
    const urbaserCode = cleanString(p[10]);
    if (!urbaserCode) return;
    
    const zone = cleanString(p[13]);
    const street = cleanString(p[14]);
    const houseNumber = cleanString(p[15]);
    const floor = cleanString(p[16]);
    const ref = cleanString(p[17]);
    
    let fullAddress = '';
    if (zone) fullAddress += `Zona: ${zone}. `;
    if (street) fullAddress += `Calle: ${street}. `;
    if (houseNumber) fullAddress += `Nro: ${houseNumber}. `;
    if (floor) fullAddress += `Piso: ${floor}. `;
    if (ref) fullAddress += `Ref: ${ref}.`;
    
    const isCondo = cleanString(p[5]) === '1'; // 1 = True usually
    const isChild = urbaserCode.includes('-');
    
    let classification = 'INDEPENDIENTE';
    if (isCondo && urbaserCode.endsWith('0') && !isChild) classification = 'CONDOMINIO';
    // We don't overwrite HIJO_DE if it already exists, so we'll just be careful.
    
    const ecoActivityId = cleanString(p[4]);
    
    if (propertyUpdatesMap.has(urbaserCode)) {
      // It's a duplicate local! (Multiple Economic Activities / Nietos extra)
      const existing = propertyUpdatesMap.get(urbaserCode);
      if (ecoActivityId && ecoActivityId !== '0') {
        if (!existing.actividades.includes(ecoActivityId)) {
          existing.actividades.push(ecoActivityId);
        }
      }
    } else {
      propertyUpdatesMap.set(urbaserCode, {
        urbaserCode,
        payload: {
          direccion: fullAddress.trim(),
        },
        actividades: (ecoActivityId && ecoActivityId !== '0') ? [ecoActivityId] : [],
        isCondo
      });
    }
  });

  // Convert map to array and prepare final payload
  const propertyUpdates = Array.from(propertyUpdatesMap.values()).map(item => {
    // Join multiple activities with comma
    if (item.actividades.length > 0) {
      item.payload.actividad_economica_id = item.actividades.join(',');
    }
    
    // Set type/classification logic safely (don't override existing HIJO_DE)
    // Actually, we'll fetch existing first to not override HIJO_DE, or we just rely on the existing schema.
    if (item.isCondo) {
      item.payload.tipo = 'CONDOMINIO';
    }
    
    return item;
  });

  console.log(`-> ${propertyUpdates.length} inmuebles únicos encontrados (con direcciones y nietos procesados). Actualizando en Supabase...`);
  
  let totalProp = 0;
  for (let i = 0; i < propertyUpdates.length; i += 25) {
    const chunk = propertyUpdates.slice(i, i + 25);
    const promises = chunk.map(item => updateWithRetry('inmuebles', 'inmueble', item.urbaserCode, item.payload));
    await Promise.all(promises);
    totalProp += chunk.length;
    process.stdout.write(`.${totalProp}`);
  }
  
  console.log(`\n¡${totalProp} inmuebles actualizados!`);
  console.log("SINCRONIZACIÓN PROFUNDA FINALIZADA.");
}

runFullSync();
