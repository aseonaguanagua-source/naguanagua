const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: inm } = await sb.from('inmuebles').select('id, inmueble, actividad_principal').eq('identidad', 'J-295063008');
  console.log("Inmuebles for Sambil RIF:", inm.length);
  
  // Also check how many of these are in condominio_unidades
  const { data: uds } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', 'a89c4de4-8507-4eab-acc9-ebfe4c3d387f');
  console.log("Unidades in Sambil condo:", uds.length);
}
check();
