require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: act } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true }).eq('estado', 'Activo');
  const { count: inact } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true }).eq('estado', 'Inactivo');
  console.log(`Activos: ${act}, Inactivos: ${inact}`);
}
run();
