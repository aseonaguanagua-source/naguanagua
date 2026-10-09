require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: byDir } = await supabase.from('inmuebles').select('identidad').ilike('direccion', '%SAMBIL%');
  
  if (!byDir) return;
  const rifs = byDir.map(p => p.identidad);
  
  // facturas by identidad
  let totalFacs = 0;
  for(let i=0; i<rifs.length; i+=100) {
    const batch = rifs.slice(i, i+100);
    const { data: facs } = await supabase.from('facturas').select('monto').in('identidad', batch).eq('estado', 'Pendiente');
    if (facs) {
      totalFacs += facs.reduce((acc, f) => acc + Number(f.monto), 0);
    }
  }
  
  console.log(`Deuda Total Sambil (Facturas Pendientes de los 443 locales): Bs. ${totalFacs.toLocaleString('es-VE')}`);
}
run();
