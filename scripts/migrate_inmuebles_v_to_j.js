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
  console.log('--- STARTING INMUEBLES V -> J HARMONIZATION ---');
  console.log('Fetching J- contribuyentes and V- inmuebles...');

  const contribs = await fetchAll('contribuyentes', 'identidad');
  const inms = await fetchAll('inmuebles', 'id, identidad');

  const jMap = new Map();
  contribs.forEach(c => {
    if (c.identidad && c.identidad.startsWith('J-')) {
      const num = c.identidad.replace(/^J-0*/, '');
      if (num !== '' && num !== '0') {
        jMap.set(num, c.identidad);
      }
    }
  });

  const pairMap = new Map(); // oldId -> newId
  inms.forEach(i => {
    if (i.identidad && i.identidad.startsWith('V-')) {
      const num = i.identidad.replace(/^V-0*/, '');
      if (num !== '' && num !== '0' && jMap.has(num)) {
        pairMap.set(i.identidad, jMap.get(num));
      }
    }
  });

  const pairs = Array.from(pairMap.entries());
  console.log(`Found ${pairs.length} unique identities to migrate to J- in table 'inmuebles'.`);

  let updatedCount = 0;
  let errorCount = 0;
  const CHUNK_SIZE = 40;

  for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
    const chunk = pairs.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async ([oldId, newId]) => {
        const { data, error } = await sb
          .from('inmuebles')
          .update({ identidad: newId })
          .eq('identidad', oldId)
          .select('id');

        if (error) {
          console.error(`Error updating ${oldId} -> ${newId}: ${error.message}`);
          errorCount++;
        } else if (data) {
          updatedCount += data.length;
        }
      })
    );

    if ((i + CHUNK_SIZE) % 400 === 0 || i + CHUNK_SIZE >= pairs.length) {
      console.log(`Progress: ${Math.min(i + CHUNK_SIZE, pairs.length)} / ${pairs.length} pairs processed (${updatedCount} inmuebles updated)`);
    }
  }

  console.log('--- HARMONIZATION COMPLETE ---');
  console.log(`Total Inmuebles Updated to true J- prefix: ${updatedCount}`);
  console.log(`Errors: ${errorCount}`);
})();
