const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('*')
    .or(`identidad.ilike.%auri000001%,inmueble.ilike.%auri000001%,cod_cont.ilike.%auri000001%`);
    
  if (error) console.error("Error inmuebles:", error);
  console.log("Inmuebles for auri000001:");
  console.dir(data, { depth: null });

  if (data && data.length > 0) {
    const identidades = [...new Set(data.map(d => d.identidad))];
    const inmueblesIds = data.map(d => d.inmueble);
    
    const { data: facturas, error: e2 } = await supabase
      .from('facturas')
      .select('*')
      .in('identidad', identidades)
      .eq('estado', 'Pendiente');
      
    console.log("Facturas pendientes:");
    console.dir(facturas, { depth: null });
  }
}
check();
