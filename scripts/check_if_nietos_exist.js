const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

const dumpPath = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/sigyr_prod_20260826.sql';

async function getAllRows(table, select, filters = []) {
  let all = [];
  let step = 1000;
  for (let start = 0; ; start += step) {
    let q = sb.from(table).select(select).range(start, start + step - 1);
    for (const f of filters) q = q[f.method](...f.args);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < step) break;
  }
  return all;
}

async function run() {
  console.log('Fetching N/A Hijos...');
  const todosHijos = await getAllRows('inmuebles', 'id, inmueble, actividad_principal', [
    { method: 'not', args: ['condominio_padre_id', 'is', null] },
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);
  const naHijos = todosHijos.filter(h => h.actividad_principal === 'N/A' || !h.actividad_principal);
  const targetUrbaserCodes = new Set(naHijos.map(h => h.inmueble));
  
  let currentTable = null;
  const properties = {}; 
  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.([^\s]+)/);
      if (match) currentTable = match[1];
      continue;
    }
    if (line === '\\.') { currentTable = null; continue; }
    if (currentTable === 'properties') {
      const cols = line.split('\t');
      if (cols.length > 22) {
        properties[cols[0]] = { urbCode: cols[10], parentId: cols[22] };
      }
    }
  }

  const nietosUrbCodes = [];
  for (const id in properties) {
     const pId = properties[id].parentId;
     if (pId && properties[pId] && targetUrbaserCodes.has(properties[pId].urbCode)) {
        nietosUrbCodes.push(properties[id].urbCode);
     }
  }

  console.log('Found 313 Nietos. Checking if they exist in Supabase...');
  let existing = 0;
  // Check in batches
  for(let i=0; i<nietosUrbCodes.length; i+=100) {
      const batch = nietosUrbCodes.slice(i, i+100);
      const {data, error} = await sb.from('inmuebles').select('inmueble').in('inmueble', batch);
      if (error) console.error(error);
      if (data) existing += data.length;
  }

  console.log(`Nietos that ALREADY exist in Supabase: ${existing} / ${nietosUrbCodes.length}`);
}
run().catch(console.error);
