const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findSambil() {
  const { data } = await sb.from('inmuebles').select('id, inmueble, tipo, actividad_principal, direccion, identidad').ilike('direccion', '%sambil%');
  console.log("Inmuebles Sambil count:", data.length);
  if (data.length > 0) {
    console.log(data[0]);
  }
}
findSambil();
