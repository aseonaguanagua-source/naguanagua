const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!supabaseUrl || !supabaseKey){
  // fallback if not in env, we can extract from env.local
  require('dotenv').config({ path: '.env.local' });
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms } = await supabase
    .from('inmuebles')
    .select('*')
    .ilike('identidad', '%3386120%');
    
  console.log("Inmuebles para 3386120:");
  console.table(inms.map(i => ({
    id: i.id,
    identidad: i.identidad,
    inmueble: i.inmueble,
    deuda_mmv: i.deuda_mmv,
    meses_deuda: i.meses_deuda,
    deuda_congelada_bs: i.deuda_congelada_bs,
    clasificacion: i.clasificacion
  })));
}
check();
