const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m);
    const serviceKeyMatch = envContent.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m);
    const anonKeyMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m);
    if (urlMatch && !SUPABASE_URL) SUPABASE_URL = urlMatch[1].trim();
    if (serviceKeyMatch) SUPABASE_KEY = serviceKeyMatch[1].trim();
    else if (anonKeyMatch && !SUPABASE_KEY) SUPABASE_KEY = anonKeyMatch[1].trim();
  } catch (e) {
    console.warn('No se pudo leer .env.local:', e.message);
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error crítico: Faltan credenciales de Supabase (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sqlPath = process.env.SQL_DUMP_PATH || path.resolve(__dirname, '../../documentos/filtered_naguanagua_data.sql');

if (!fs.existsSync(sqlPath)) {
  console.error(`Error crítico: No se encontró el archivo SQL en ${sqlPath}`);
  process.exit(1);
}

const sqlContent = fs.readFileSync(sqlPath, 'utf8');

function cleanString(str) {
  if (!str || str === 'NULL') return '';
  return str.replace(/^'([\s\S]*)'$/, '$1').trim();
}

function parseSqlValues(tableName) {
  const records = [];
  const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const regex = new RegExp(`INSERT INTO public\\."${safeTable}".*?VALUES\\s*([\\s\\S]*?);`, 'g');
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    const valuesString = match[1];
    let inString = false;
    let currentTuple = [];
    let currentVal = '';
    for (let i = 0; i < valuesString.length; i++) {
      const char = valuesString[i];
      if (char === '\\' && inString && i + 1 < valuesString.length) {
        currentVal += char + valuesString[i + 1];
        i++;
        continue;
      }
      if (char === "'" && !inString) {
        inString = true;
      } else if (char === "'" && inString) {
        if (valuesString[i + 1] === "'") {
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
        while (i + 1 < valuesString.length && valuesString[i + 1] !== '(') i++;
        if (i + 1 < valuesString.length && valuesString[i + 1] === '(') i++;
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
    console.error(`\nError en intento ${i + 1} (id=${item.id}): ${error.message}. Reintentando...`);
    await delay(2000);
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
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, actividad_principal')
      .order('id', { ascending: true })
      .range(from, from + step - 1);
    if (error) {
      throw new Error(`Error paginando inmuebles desde Supabase en offset ${from}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    currentInmuebles = currentInmuebles.concat(data);
    if (data.length < step) break;
    from += step;
  }
  console.log(`-> Supabase tiene ${currentInmuebles.length} inmuebles en total.`);

  // Guardar lista de inmuebles por código base para no sobrescribir inmuebles con sufijo (ej. URB001-1, URB001-2)
  const supabaseInmueblesMap = new Map();
  currentInmuebles.forEach(r => {
    if (!r.inmueble) return;
    const baseCode = String(r.inmueble).split('-')[0].trim();
    if (!supabaseInmueblesMap.has(baseCode)) {
      supabaseInmueblesMap.set(baseCode, []);
    }
    supabaseInmueblesMap.get(baseCode).push(r);
  });

  console.log("3. Evaluando relaciones Padre-Hijo...");

  const updates = [];
  const queuedIds = new Set();

  oldProperties.forEach(p => {
    const urbaserCode = cleanString(p[10]);
    if (urbaserCode && supabaseInmueblesMap.has(urbaserCode)) {
      const matchingRows = supabaseInmueblesMap.get(urbaserCode);
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

      if (expectedActividadPrincipal !== '') {
        for (const supabaseRow of matchingRows) {
          if (supabaseRow.actividad_principal !== expectedActividadPrincipal && !queuedIds.has(supabaseRow.id)) {
            queuedIds.add(supabaseRow.id);
            updates.push({
              id: supabaseRow.id,
              inmueble: supabaseRow.inmueble,
              actividad_principal: expectedActividadPrincipal
            });
          }
        }
      }
    }
  });

  console.log(`-> Se van a corregir/sincronizar ${updates.length} inmuebles huérfanos o mal etiquetados.`);

  if (updates.length > 0) {
    console.log("4. Aplicando actualizaciones en Supabase...");
    let exitosos = 0;
    let fallidos = 0;

    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50);
      const results = await Promise.all(chunk.map(item => updateWithRetry('inmuebles', item)));
      results.forEach(ok => {
        if (ok) exitosos++;
        else fallidos++;
      });
      process.stdout.write(`.${exitosos}`);
    }
    console.log(`\n¡Sincronización finalizada! Actualizados: ${exitosos}, Fallidos: ${fallidos}.`);
    if (fallidos > 0) process.exitCode = 1;
  } else {
    console.log("No hay inmuebles que requieran sincronización.");
  }
}

runForceSync().catch(err => {
  console.error("Fallo crítico en runForceSync:", err);
  process.exit(1);
});
