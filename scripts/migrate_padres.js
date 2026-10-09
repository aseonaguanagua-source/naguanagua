const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
  console.log('Fetching data...');
  const inmuebles = await getAllRows('inmuebles', 'id, inmueble, es_condominio, condominio_padre_id, padre_id');
  const condominios = new Set((await getAllRows('condominios', 'codigo')).map(c => c.codigo));
  
  let updates = 0;

  for (const loc of inmuebles) {
    let needsUpdate = false;
    let payload = {};

    // 1. Es un hijo (tiene condominio_padre_id) pero no es un condominio oficial
    if (loc.condominio_padre_id && !condominios.has(loc.condominio_padre_id)) {
      payload.padre_id = loc.condominio_padre_id;
      payload.condominio_padre_id = null;
      payload.es_condominio = false;
      needsUpdate = true;
    }

    // 2. Es un padre falso (es_condominio = true pero no esta en la tabla condominios)
    if (loc.es_condominio && !condominios.has(loc.inmueble)) {
      payload.es_condominio = false;
      payload.condominio_padre_id = null;
      needsUpdate = true;
    }

    if (needsUpdate) {
      let retryCount = 0;
      let success = false;
      while (retryCount < 3 && !success) {
        const { error } = await sb.from('inmuebles').update(payload).eq('id', loc.id);
        if (error) {
          console.error('Error updating', loc.inmueble, error.message);
          retryCount++;
          await new Promise(r => setTimeout(r, 1000));
        } else {
          success = true;
          updates++;
          if (updates % 100 === 0) console.log(`Updated ${updates} rows...`);
        }
      }
    }
  }

  console.log(`Migration complete! Updated ${updates} records.`);
}

run().catch(console.error);
