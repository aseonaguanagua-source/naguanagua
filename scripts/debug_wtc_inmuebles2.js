require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  const { data: unidades } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  const inmsIds = unidades.map(u => u.inmueble).filter(Boolean);
  
  const { data: inmuebles, error } = await supabase.from('inmuebles').select('codigo, mmv_mes, actividad_principal').in('codigo', inmsIds);
  console.log("Error:", error);
}
run();
