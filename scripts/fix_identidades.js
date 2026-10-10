const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
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

// Function to normalize name for comparison
function norm(str) {
  return (str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
}

async function runFix() {
  console.log("1. Parseando old data...");
  const oldUsers = parseSqlValues('users');
  const oldProperties = parseSqlValues('properties');

  const userMap = new Map();
  oldUsers.forEach(u => {
    userMap.set(cleanString(u[0]), {
      id: cleanString(u[0]),
      nombre: cleanString(u[1]),
      documento: cleanString(u[9]),
      email: cleanString(u[3]),
      telefono: cleanString(u[7]),
      direccion: cleanString(u[19])
    });
  });

  const propMap = new Map();
  oldProperties.forEach(p => {
    propMap.set(cleanString(p[10]), {
      urbaserCode: cleanString(p[10]),
      userId: cleanString(p[1])
    });
  });

  console.log("2. Fetching Supabase contribuyentes and inmuebles...");
  
  let currentContribuyentes = new Map();
  let from = 0;
  while(true) {
    const { data, error } = await supabase.from('contribuyentes').select('*').range(from, from + 1000);
    if(error || !data.length) break;
    data.forEach(d => currentContribuyentes.set(d.identidad, d));
    from += 1001;
  }

  let currentInmuebles = [];
  from = 0;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('*').range(from, from + 1000);
    if(error || !data.length) break;
    currentInmuebles = currentInmuebles.concat(data);
    from += 1001;
  }

  console.log(`Loaded ${currentContribuyentes.size} contribuyentes and ${currentInmuebles.length} inmuebles from Supabase.`);

  let mismatches = [];
  let fixesContrib = [];
  let fixesInmuebles = [];

  for (let inm of currentInmuebles) {
    const baseCode = inm.inmueble.split('-')[0];
    const oldProp = propMap.get(baseCode);
    if (!oldProp) continue;

    const oldUser = userMap.get(oldProp.userId);
    if (!oldUser) continue;

    const currentC = currentContribuyentes.get(inm.identidad);
    if (!currentC) continue; // broken ref?

    // Compare names
    const nameOld = norm(oldUser.nombre);
    const nameNew = norm(currentC.nombre);
    
    // If names are wildly different (e.g., 'MARIA' vs 'JUAN')
    // We can use a simple length/inclusion check, but maybe equality is better.
    // If they share less than 50% of the words, it's a mismatch.
    const wordsOld = nameOld.split(''); // wait norm removes spaces. Let's just compare strings.
    
    // A more lenient check: if the first 4 chars differ, and length > 5
    // But since `norm` removes spaces, let's use the raw uppercase.
    const rawOld = (oldUser.nombre || '').toUpperCase().trim();
    const rawNew = (currentC.nombre || '').toUpperCase().trim();
    
    if (rawOld !== rawNew && !rawNew.includes(rawOld) && !rawOld.includes(rawNew)) {
      mismatches.push({
        inmueble: inm.inmueble,
        identidadAntigua: inm.identidad,
        nombreNuevo: currentC.nombre,
        nombreRealViejo: oldUser.nombre,
        nuevaIdentidadPropuesta: oldUser.documento && oldUser.documento !== '0' && oldUser.documento !== inm.identidad ? oldUser.documento + '-' + baseCode : baseCode,
        oldUser
      });
    }
  }

  console.log(`Found ${mismatches.length} properties with wildly mismatched names.`);
  if (mismatches.length > 0) {
    console.log(mismatches.slice(0, 5));
  }
  
  fs.writeFileSync('mismatches.json', JSON.stringify(mismatches, null, 2));
}

runFix();
