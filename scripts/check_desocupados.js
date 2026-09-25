const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function check() {
  const { data } = await supabase.from('inmuebles').select('inmueble, actividad_principal').ilike('actividad_principal', '%[HIJO_DE:URB016119]%');
  const desocupados = data.filter(d => d.actividad_principal.toLowerCase().includes('desocupad'));
  console.log(`Total desocupados: ${desocupados.length}`);
}
check();
