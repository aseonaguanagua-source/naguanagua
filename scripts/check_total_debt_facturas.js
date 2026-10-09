require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  let totalPendiente = 0;
  let from = 0;
  let limit = 1000;
  
  while(true) {
    const { data, error } = await supabase.from('facturas')
      .select('monto')
      .eq('estado', 'Pendiente')
      .range(from, from + limit - 1);
      
    if (error || !data || data.length === 0) break;
    
    totalPendiente += data.reduce((acc, f) => acc + Number(f.monto), 0);
    from += limit;
  }
  
  console.log(`Deuda Total (Facturas Pendientes): Bs. ${totalPendiente.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`);
}

run();
