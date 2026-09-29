const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: conts } = await supabase
    .from('contribuyentes')
    .select('*')
    .or(`Identidad.ilike.%auri00%,cod_cont.ilike.%auri00%`);
    
  console.log("Contribuyentes:", conts);
  
  if (conts && conts.length > 0) {
    const identidades = conts.map(c => c.Identidad);
    const { data: inms } = await supabase.from('inmuebles').select('*').in('identidad', identidades);
    console.log("Inmuebles (from contribuyente):", inms);
    
    const { data: facturas } = await supabase.from('facturas').select('*').in('identidad', identidades).eq('estado', 'Pendiente');
    console.log("Facturas pendientes:", facturas);
  } else {
    const { data: inms2 } = await supabase.from('inmuebles').select('*').ilike('inmueble', '%auri000%');
    console.log("Inmuebles (by id):", inms2);
  }
}
check();
