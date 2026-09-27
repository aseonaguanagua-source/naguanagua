const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: facturas } = await supabase
    .from('facturas')
    .select('*')
    .ilike('identidad', '%19109082%');
    
  console.log("Facturas para 19109082:");
  console.table(facturas.map(i => ({
    referencia: i.referencia,
    estado: i.estado,
    monto: i.monto
  })));
}
check();
