require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const rif = 'J-312070412'; // WTC
  
  const { data, error } = await supabase.from('facturas').select('id, emision, vencimiento, monto, estado, referencia').eq('identidad', rif).eq('estado', 'Pendiente');
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`World Trade Center tiene ${data.length} facturas Pendientes.`);
  
  // Sum by month or emision
  for (const f of data) {
    console.log(`- Ref: ${f.referencia} | Emisión: ${f.emision} | Monto: Bs. ${Number(f.monto).toLocaleString('es-VE')}`);
  }
}
run();
