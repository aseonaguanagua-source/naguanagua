const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await sb.from('inmuebles').select('id, inmueble, identidad, cod_cont').limit(100000);
  
  if (error) {
    console.error(error);
    return;
  }
  
  const badId = data.filter(i => i.identidad && i.identidad.startsWith('URB'));
  console.log(`Inmuebles con identidad que empieza con URB: ${badId.length}`);
  if (badId.length > 0) console.log(badId.slice(0, 5));
  
  const badCod = data.filter(i => i.cod_cont && i.cod_cont.startsWith('URB'));
  console.log(`Inmuebles con cod_cont que empieza con URB: ${badCod.length}`);
  if (badCod.length > 0) console.log(badCod.slice(0, 5));
}
check();
