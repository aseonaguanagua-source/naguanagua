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
  const todosHijos = await getAllRows('inmuebles', 'id, inmueble, actividad_principal, contribuyente, condominio_padre_id, tipo', [
    { method: 'not', args: ['condominio_padre_id', 'is', null] },
    { method: 'neq', args: ['estado', 'Eliminado'] }
  ]);

  const naHijos = todosHijos.filter(h => h.actividad_principal === 'N/A' || !h.actividad_principal);
  const targetUrbaserCodes = new Set(naHijos.map(h => h.inmueble));
  
  let currentTable = null;
  const properties = {}; // id -> { urbCode, parentId, actId }
  const economicActivities = {}; // id -> name

  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.([^\s]+)/);
      if (match) currentTable = match[1];
      continue;
    }
    if (line === '\\.') { currentTable = null; continue; }

    if (currentTable === 'economic_activities') {
      const cols = line.split('\t');
      if (cols.length > 1) economicActivities[cols[0]] = cols[1];
    } else if (currentTable === 'properties') {
      const cols = line.split('\t');
      if (cols.length > 22) {
        const id = cols[0];
        const actId = cols[4];
        const urbCode = cols[10];
        const parentId = cols[22];
        properties[id] = { urbCode, parentId, actId };
      }
    }
  }

  // Check if any property has parentId pointing to our Hijos N/A
  const oldHijoIds = new Set();
  const oldIdToUrb = {};
  for (const id in properties) {
     if (targetUrbaserCodes.has(properties[id].urbCode)) {
        oldHijoIds.add(id);
        oldIdToUrb[id] = properties[id].urbCode;
     }
  }

  let childrenFound = 0;
  for (const id in properties) {
     const pId = properties[id].parentId;
     if (pId && oldHijoIds.has(pId)) {
        console.log(`Found Nieto: ${properties[id].urbCode} under Hijo ${oldIdToUrb[pId]}`);
        childrenFound++;
     }
  }
  
  console.log(`Total Nietos found via property_id linkage: ${childrenFound}`);
}

run().catch(console.error);
