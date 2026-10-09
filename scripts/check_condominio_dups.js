const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await sb.from('condominio_unidades').select('inmueble');
  if (error) {
    console.error(error);
    return;
  }
  
  const idCount = {};
  data.forEach(d => {
    if (!idCount[d.inmueble]) idCount[d.inmueble] = 0;
    idCount[d.inmueble]++;
  });
  
  const dups = Object.keys(idCount).filter(k => idCount[k] > 1);
  console.log(`Duplicados en condominio_unidades: ${dups.length}`);
  if (dups.length > 0) {
    console.log(dups.slice(0, 5));
  }
}
check();
