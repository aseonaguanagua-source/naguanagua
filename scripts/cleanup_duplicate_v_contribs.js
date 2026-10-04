const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAll(table, select) {
  let all = [], page = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error('Error fetching', table, error);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

(async () => {
  console.log('--- ENRICHING J- AND REMOVING ORPHANED DUPLICATE V- IN CONTRIBUYENTES ---');
  const contribs = await fetchAll('contribuyentes', 'id, identidad, nombre, email, telefono, direccion, observaciones');
  
  const jMap = new Map();
  contribs.forEach(c => {
    if (c.identidad && c.identidad.startsWith('J-')) {
      const num = c.identidad.replace(/^J-0*/, '');
      if (num !== '' && num !== '0') jMap.set(num, c);
    }
  });

  const duplicateV = [];
  contribs.forEach(c => {
    if (c.identidad && c.identidad.startsWith('V-')) {
      const num = c.identidad.replace(/^V-0*/, '');
      if (num !== '' && num !== '0' && jMap.has(num)) {
        duplicateV.push({ v: c, j: jMap.get(num) });
      }
    }
  });

  console.log(`Found ${duplicateV.length} duplicate V- records to merge and delete.`);

  // 1. Enrich J records if V has contact data and J does not
  let enrichedCount = 0;
  for (const { v, j } of duplicateV) {
    const updates = {};
    if ((!j.email || j.email.trim() === '') && v.email && v.email.trim() !== '') {
      updates.email = v.email.trim();
    }
    if ((!j.telefono || j.telefono.trim() === '') && v.telefono && v.telefono.trim() !== '') {
      updates.telefono = v.telefono.trim();
    }
    if ((!j.direccion || j.direccion.trim() === '') && v.direccion && v.direccion.trim() !== '') {
      updates.direccion = v.direccion.trim();
    }

    if (Object.keys(updates).length > 0) {
      await sb.from('contribuyentes').update(updates).eq('id', j.id);
      enrichedCount++;
    }
  }
  console.log(`Enriched ${enrichedCount} J- records with contact data from legacy V- records.`);

  // 2. Delete duplicate V- records in batches
  const idsToDelete = duplicateV.map(d => d.v.id);
  const CHUNK_SIZE = 100;
  let deletedCount = 0;

  for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
    const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
    const { error } = await sb.from('contribuyentes').delete().in('id', chunk);
    if (error) {
      console.error(`Error deleting chunk starting at ${i}:`, error.message);
    } else {
      deletedCount += chunk.length;
    }
    if ((i + CHUNK_SIZE) % 500 === 0 || i + CHUNK_SIZE >= idsToDelete.length) {
      console.log(`Deleted ${Math.min(i + CHUNK_SIZE, idsToDelete.length)} / ${idsToDelete.length} duplicate records.`);
    }
  }

  console.log(`--- CLEANUP FINISHED: Deleted ${deletedCount} duplicate legacy V- records. ---`);
})();
