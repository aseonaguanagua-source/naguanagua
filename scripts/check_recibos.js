require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('recibos').select('estado_pago, count', { count: 'exact' });
  console.log(error || data?.slice(0, 5));
  
  const { count } = await supabase.from('recibos').select('*', { count: 'exact', head: true });
  console.log(`Total recibos: ${count}`);
  
  const { data: sample } = await supabase.from('recibos').select('inmueble, monto_total, estado_pago, status_recibo').limit(5);
  console.log('Sample:', sample);
}
run();
