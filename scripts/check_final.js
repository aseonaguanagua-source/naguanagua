const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function check() {
  const { data } = await supabase.from('inmuebles').select('inmueble, mmv_mes, deuda_mmv, actividad_principal').eq('inmueble', 'URB030799');
  console.log('URB030799:', data);
  const { data: d2 } = await supabase.from('inmuebles').select('inmueble, mmv_mes, deuda_mmv, actividad_principal').ilike('actividad_principal', '%VENTA AMB. ALIMENTOS Y BEBIDAS%').limit(2);
  console.log('Alimentos:', d2);
}
check();
