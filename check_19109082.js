const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms } = await supabase
    .from('inmuebles')
    .select('*')
    .ilike('identidad', '%19109082%');
    
  console.log("Inmuebles para 19109082:");
  console.table(inms.map(i => ({
    identidad: i.identidad,
    inmueble: i.inmueble,
    deuda_mmv: i.deuda_mmv,
    meses_deuda: i.meses_deuda,
    deuda_congelada_bs: i.deuda_congelada_bs
  })));
}
check();
