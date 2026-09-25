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
const notas = require('./notas_extraidas.json');

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

async function uploadNotas() {
  const entries = Object.entries(notas);
  console.log(`Subiendo ${entries.length} notas a Supabase...`);
  
  let total = 0;
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const promises = chunk.map(([identidad, nota]) => 
      updateWithRetry('contribuyentes', identidad, { observaciones: nota })
    );
    await Promise.all(promises);
    total += chunk.length;
    process.stdout.write(`.${total}`);
  }
  console.log('\n¡Todas las notas han sido inyectadas con éxito!');
}

uploadNotas();
