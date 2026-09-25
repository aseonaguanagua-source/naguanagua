const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function check() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('id, identidad, inmueble, tipo, deuda_mmv, actividad_principal')
    .ilike('actividad_principal', `%[HIJO_DE:URB016119]%`);
  console.log("Hijos found:", data?.length);
  if (error) console.log(error);
}
check();
