const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  await supabase.from('inmuebles').update({ es_condominio: false }).eq('inmueble', 'AURI001403');
  await supabase.from('inmuebles').update({ condominio_padre_id: null }).in('inmueble', ['AURI017041', 'AURI001404']);
  console.log("Fixed AURI001403");
}
check();
