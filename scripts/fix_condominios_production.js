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
  console.log(`Found ${naHijos.length} N/A Hijos.`);
  
  let currentTable = null;
  const properties = {}; 
  const economicActivities = {}; 
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
        properties[cols[0]] = { urbCode: cols[10], parentId: cols[22], actId: cols[4] };
      }
    }
  }

  const oldHijoIds = {}; // urbCode -> old id
  for (const id in properties) {
     if (targetUrbaserCodes.has(properties[id].urbCode)) {
        oldHijoIds[properties[id].urbCode] = id;
     }
  }

  // Find Nietos
  const nietosByHijo = {}; // hijoUrbCode -> [{ urbCode, actName }]
  const allNietoUrbCodes = [];
  const nietosArray = [];
  
  for (const id in properties) {
     const pId = properties[id].parentId;
     if (pId && properties[pId] && targetUrbaserCodes.has(properties[pId].urbCode)) {
        const hijoUrb = properties[pId].urbCode;
        if (!nietosByHijo[hijoUrb]) nietosByHijo[hijoUrb] = [];
        const n = {
           urbCode: properties[id].urbCode,
           actName: economicActivities[properties[id].actId] || 'Sin Actividad',
           hijoUrb: hijoUrb
        };
        nietosByHijo[hijoUrb].push(n);
        allNietoUrbCodes.push(n.urbCode);
        nietosArray.push(n);
     }
  }

  // Find which Nietos already exist
  let existingNietos = new Set();
  for(let i=0; i<allNietoUrbCodes.length; i+=100) {
      const batch = allNietoUrbCodes.slice(i, i+100);
      const {data} = await sb.from('inmuebles').select('inmueble').in('inmueble', batch);
      if (data) data.forEach(d => existingNietos.add(d.inmueble));
  }

  console.log('--- STARTING DATABASE UPDATES ---');
  let updatedExistingNietos = 0;
  let insertedMissingNietos = 0;
  let updatedNaHijos = 0;

  // 1. Process Nietos
  for (const n of nietosArray) {
     if (existingNietos.has(n.urbCode)) {
        // UPDATE existing
        await sb.from('inmuebles').update({ condominio_padre_id: n.hijoUrb }).eq('inmueble', n.urbCode);
        updatedExistingNietos++;
     } else {
        // INSERT missing
        await sb.from('inmuebles').insert({
           inmueble: n.urbCode,
           condominio_padre_id: n.hijoUrb,
           actividad_principal: n.actName,
           estado: 'Inactivo', // or whatever default
           es_condominio: false
        });
        insertedMissingNietos++;
     }
  }

  // 2. Process Hijos without Nietos
  for (const h of naHijos) {
     const nietos = nietosByHijo[h.inmueble] || [];
     if (nietos.length === 0) {
        const oldId = oldHijoIds[h.inmueble];
        let oldAct = 'Sin Actividad Asignada';
        if (oldId && properties[oldId]) {
           oldAct = economicActivities[properties[oldId].actId] || oldAct;
        }
        await sb.from('inmuebles').update({ actividad_principal: oldAct }).eq('inmueble', h.inmueble);
        updatedNaHijos++;
     }
  }

  console.log(`FINISHED!`);
  console.log(`Nietos Existentes Re-vinculados (UPDATE): ${updatedExistingNietos}`);
  console.log(`Nietos Faltantes Creados (INSERT): ${insertedMissingNietos}`);
  console.log(`Hijos N/A sin descendencia Actualizados con Actividad Real: ${updatedNaHijos}`);
}

run().catch(console.error);
