require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('facturas').select('*').eq('identidad', 'J-312070412').eq('estado', 'Pendiente');
  
  if (data) {
    data.forEach(f => {
      console.log(`Ref: ${f.referencia} | Emision: ${f.emision} | Monto: ${f.monto}`);
      // Does facturas have an inmueble column?
      console.log(`  Identidad: ${f.identidad} | Contribuyente: ${f.contribuyente}`);
    });
    console.log(Object.keys(data[0]));
  }
}
run();
