const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  // Buscar inmuebles que pertenecen a un condominio pero no tienen etiqueta de local extraída
  const { data, error } = await supabase.from('inmuebles').select('id, inmueble, direccion, condominio_padre_id, contribuyente').not('condominio_padre_id', 'is', null).limit(20);
  if (error) console.error(error);
  else {
    console.log("Sample:", data.map(d => ({ inmueble: d.inmueble, dir: d.direccion })));
  }
}
test();
