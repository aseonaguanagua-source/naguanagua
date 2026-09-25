const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
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
         // Start of tuple
      } else {
         currentVal += char;
      }
    }
  }
  return records;
}

function cleanString(str) {
  if (!str) return '';
  if (str === 'NULL') return '';
  // Eliminar comillas simples iniciales y finales si existen
  return str.replace(/^'(.*)'$/, '$1').trim();
}

async function migrateData() {
  console.log("Parseando base de datos original...");
  const oldUsers = parseSqlValues('users');
  const oldProperties = parseSqlValues('properties');
  console.log(`Leídos ${oldUsers.length} usuarios y ${oldProperties.length} propiedades del sistema viejo.`);

  // Crear mapa de user_id -> Datos del Usuario
  const userMap = new Map();
  oldUsers.forEach(u => {
    userMap.set(cleanString(u[0]), { // u[0] is id
      nombre: cleanString(u[1]),     // name
      email: cleanString(u[3]),      // email
      telefono: cleanString(u[7]),   // phone
      documento: cleanString(u[9]),  // document
      direccion: cleanString(u[19])  // fiscal_address
    });
  });

  // Mapear urbaser_code -> Datos del Usuario
  const propertyMap = new Map();
  oldProperties.forEach(p => {
    const userId = cleanString(p[1]); // user_id
    const urbaserCode = cleanString(p[10]); // urbaser_code
    if (userMap.has(userId)) {
      propertyMap.set(urbaserCode, userMap.get(userId));
    }
  });

  console.log(`Se cruzaron ${propertyMap.size} códigos de inmuebles con sus usuarios reales.`);

  // Obtener contribuyentes actuales en Supabase
  console.log("Obteniendo contribuyentes de Supabase...");
  let currentContribuyentes = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('contribuyentes').select('identidad, nombre, email, telefono, direccion').range(from, from + step - 1);
    if(error) { console.error(error); break; }
    if(data.length === 0) break;
    currentContribuyentes = currentContribuyentes.concat(data);
    from += step;
  }
  console.log(`Se encontraron ${currentContribuyentes.length} contribuyentes actuales en Supabase.`);

  let updates = [];
  
  // Condominios (generalmente la identidad en la base de datos nueva es igual al código URB...)
  currentContribuyentes.forEach(c => {
    // Si la identidad de Supabase coincide con un urbaser_code (Ej: AURI016859)
    if (propertyMap.has(c.identidad)) {
      const oldData = propertyMap.get(c.identidad);
      let needsUpdate = false;
      let newRow = { identidad: c.identidad };

      // Solo actualizamos si el dato viejo existe y el nuevo está genérico/N/A/vacío
      if (oldData.nombre && (c.nombre === 'N/A' || c.nombre.startsWith('Condominio '))) {
        newRow.nombre = oldData.nombre;
        needsUpdate = true;
      }
      if (oldData.email && (!c.email || c.email === 'N/A' || c.email === '')) {
        newRow.email = oldData.email;
        needsUpdate = true;
      }
      if (oldData.telefono && (!c.telefono || c.telefono === 'N/A' || c.telefono === '0' || c.telefono === '00000000000')) {
        newRow.telefono = oldData.telefono;
        needsUpdate = true;
      }
      if (oldData.direccion && (!c.direccion || c.direccion === 'Registrado desde migración' || c.direccion === 'N/A' || c.direccion === '0')) {
        newRow.direccion = oldData.direccion;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.push(newRow);
      }
    }
  });

  console.log(`Se detectaron ${updates.length} condominios/contribuyentes que necesitan actualización con datos reales.`);
  
  if (updates.length > 0) {
    console.log("Aplicando actualizaciones en Supabase...");
    let chunks = [];
    for(let i=0; i<updates.length; i+=500) {
      chunks.push(updates.slice(i, i+500));
    }
    
    let totalUpdated = 0;
    for (let i=0; i<chunks.length; i++) {
      const { error } = await supabase.from('contribuyentes').upsert(chunks[i], { onConflict: 'identidad' });
      if (error) {
        console.error("Error actualizando chunk:", error.message);
      } else {
        totalUpdated += chunks[i].length;
        process.stdout.write(`.${totalUpdated}`);
      }
    }
    console.log(`\n¡Actualización completada! ${totalUpdated} registros actualizados.`);
  } else {
    console.log("No hubo datos para actualizar.");
  }
}

migrateData();
