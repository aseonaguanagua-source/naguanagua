require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('condominios').select('id, codigo, nombre').ilike('nombre', '%CENTRO COMERCIAL%');
  console.log(data.filter(c => c.nombre.includes('SAMBIL') || c.nombre.includes('Sambil')));
  
  const { data: d2 } = await supabase.from('inmuebles').select('id, inmueble, contribuyente, es_condominio').ilike('contribuyente', '%SAMBIL%');
  console.log("Inmuebles con Sambil:", d2.length);
}
run();
