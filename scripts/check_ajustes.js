const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: d1 } = await sb.from('ajustes').select('*').limit(1).catch(()=>({}));
  console.log("ajustes:", d1);
  const { data: d2 } = await sb.from('configuracion').select('*').limit(1).catch(()=>({}));
  console.log("configuracion:", d2);
  const { data: d3 } = await sb.from('bancos_municipio').select('*').limit(1).catch(()=>({}));
  console.log("bancos_municipio:", d3);
}
run();
