const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: updated, error } = await supabase
    .from('inmuebles')
    .update({ mmv_mes: 0.91 })
    .ilike('actividad_principal', '%APARTAMENTO (ZONA A)%')
    .neq('mmv_mes', 0.91)
    .select('inmueble');
    
  if (error) console.error(error);
  console.log("Updated APARTAMENTO ZONA A:", updated?.length);
}
check();
