require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: facs, error } = await supabase.from('facturas').select('*').ilike('contribuyente', '%SAMBIL%');
  
  if (error) { console.error(error); return; }
  
  console.log(`Encontramos ${facs.length} facturas con SAMBIL`);
  
  const inactives = facs.filter(f => f.estado === 'Anulada' || f.estado === 'Eliminado'); // Not sure what states exist
  const pendientes = facs.filter(f => f.estado === 'Pendiente');
  
  let totalPendiente = 0;
  for (const f of pendientes) {
    totalPendiente += Number(f.monto);
  }
  
  console.log(`Facturas Pendientes: ${pendientes.length}`);
  console.log(`Deuda Pendiente SAMBIL: Bs. ${totalPendiente.toLocaleString('es-VE')}`);
}

run();
