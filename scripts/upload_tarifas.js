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

async function run() {
  console.log("1. Extrayendo tarifas de Inmuebles (tabla properties)...");
  
  const oldUsers = parseSqlValues('users');
  const userMap = new Map(); // user_id -> docNum
  oldUsers.forEach(u => {
    if (!u || u.length < 10) return;
    const userId = cleanString(u[0]);
    const docNum = cleanString(u[9]).replace(/[^0-9]/g, '');
    if (userId && docNum) {
      userMap.set(userId, docNum);
    }
  });

  const oldProperties = parseSqlValues('properties');
  const tarifaPropByDocNum = new Map();

  oldProperties.forEach(p => {
    // 45 is the total tariff in UCD
    if (!p || p.length < 46) return;
    const userId = cleanString(p[1]);
    const tarifaRaw = cleanString(p[45]);
    const tarifa = parseFloat(tarifaRaw);
    
    if (userId && !isNaN(tarifa) && tarifa > 0) {
      const docNum = userMap.get(userId);
      if (docNum) {
        // En caso de múltiples inmuebles, sumamos sus tarifas por ahora
        const existing = tarifaPropByDocNum.get(docNum) || 0;
        tarifaPropByDocNum.set(docNum, existing + tarifa);
      }
    }
  });

  console.log(`-> Se encontraron tarifas para ${tarifaPropByDocNum.size} contribuyentes únicos.`);

  let allInmuebles = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, identidad').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    allInmuebles = allInmuebles.concat(data);
    from += step;
  }

  const updatesToMake = [];
  allInmuebles.forEach(inm => {
    if (!inm.identidad) return;
    const docNum = inm.identidad.replace(/^[A-Za-z]+-?/, '').replace(/[^0-9]/g, '');
    if (tarifaPropByDocNum.has(docNum)) {
      const tarifa = tarifaPropByDocNum.get(docNum);
      updatesToMake.push({
        id: inm.id,
        tarifa: tarifa
      });
    }
  });
  
  console.log(`-> Actualizando tarifas en ${updatesToMake.length} registros de Supabase...`);
  
  let total = 0;
  for (let i = 0; i < updatesToMake.length; i += 50) {
    const chunk = updatesToMake.slice(i, i + 50);
    const promises = chunk.map(async item => {
       await supabase.from('inmuebles').update({ 
         mmv_mes: item.tarifa,
         deuda_mmv: item.tarifa // Setting debt to exactly 1 month for testing
       }).eq('id', item.id);
    });
    await Promise.all(promises);
    total += chunk.length;
    process.stdout.write(`.${total}`);
  }
  console.log('\n¡Todas las tarifas inyectadas exitosamente!');
}

run();
