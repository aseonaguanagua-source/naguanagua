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

async function updateWithRetry(table, ident, payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const { error } = await supabase.from(table).update(payload).eq('identidad', ident);
    if (!error) return true;
    console.error(`Error en intento ${i+1}: ${error.message}. Reintentando...`);
    await delay(1000);
  }
  return false;
}

async function run() {
  console.log("1. Extrayendo notas y mapeandolas por NUMERO DE DOCUMENTO puro...");
  const oldUsers = parseSqlValues('users');
  const notasByDocNum = new Map();

  oldUsers.forEach(u => {
    if (!u || u.length < 23) return;
    const docNum = cleanString(u[9]).replace(/[^0-9]/g, '');
    const nota = cleanString(u[22]);
    if (docNum && nota && nota !== '') {
      notasByDocNum.set(docNum, nota);
    }
  });

  console.log(`-> Se encontraron ${notasByDocNum.size} notas unicas.`);

  console.log("2. Obteniendo todas las identidades de Supabase...");
  let allContribuyentes = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('contribuyentes').select('identidad').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    allContribuyentes = allContribuyentes.concat(data);
    from += step;
  }
  
  console.log(`-> Hay ${allContribuyentes.length} contribuyentes en Supabase.`);

  const updatesToMake = [];
  allContribuyentes.forEach(c => {
    const docNum = c.identidad.replace(/^[A-Za-z]+-?/, '').replace(/[^0-9]/g, '');
    if (notasByDocNum.has(docNum)) {
      updatesToMake.push({
        identidad: c.identidad,
        nota: notasByDocNum.get(docNum)
      });
    }
  });

  console.log(`-> Se encontraron ${updatesToMake.length} coincidencias exactas para subir.`);
  
  let total = 0;
  for (let i = 0; i < updatesToMake.length; i += 50) {
    const chunk = updatesToMake.slice(i, i + 50);
    const promises = chunk.map(item => 
      updateWithRetry('contribuyentes', item.identidad, { observaciones: item.nota })
    );
    await Promise.all(promises);
    total += chunk.length;
    process.stdout.write(`.${total}`);
  }
  console.log('\n¡Todas las notas han sido inyectadas con éxito usando match por documento puro!');
}

run();
