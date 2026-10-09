require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('recibos').select('inmueble, mes, anio, monto_total, factura_id').in('factura_id', ['L-004285', 'L-004284', 'L-004110', 'L-004140', 'L-004177']);
  console.log('Recibos vinculados a las facturas del WTC:');
  console.log(data);
}
run();
