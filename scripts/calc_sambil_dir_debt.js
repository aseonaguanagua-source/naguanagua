require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: byDir } = await supabase.from('inmuebles').select('inmueble, estado').ilike('direccion', '%SAMBIL%');
  
  if (!byDir) return;
  const inms = byDir.map(p => p.inmueble);
  
  // facturas by identidad or something? Let's check recibos
  // Actually, we can sum recibos
  const { data: recs } = await supabase.from('recibos').select('monto_total').in('inmueble', inms).eq('estado_pago', 'No Pagado');
  
  let recSum = 0;
  if (recs) {
    recSum = recs.reduce((acc, r) => acc + Number(r.monto_total), 0);
  }
  
  console.log(`Deuda Total Sambil (Todos los locales) por RECIBOS: Bs. ${recSum.toLocaleString('es-VE')}`);
  
  // also check facturas by fetching them
  let facSum = 0;
  // let's fetch all facturas and filter by inmueble? Facturas has a column "referencia" or "identidad".
  // Not sure if facturas is linked by inmueble. Let's see columns of facturas.
  const { data: f } = await supabase.from('facturas').select('*').limit(1);
  console.log('Facturas columns:', f ? Object.keys(f[0]) : null);
}
run();
