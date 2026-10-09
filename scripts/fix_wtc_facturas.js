require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const rif = 'J-312070412';
  const keepRef = 'L-004285';
  
  // Get all pending facturas for WTC
  const { data: facturas } = await supabase.from('facturas').select('id, referencia, monto').eq('identidad', rif).eq('estado', 'Pendiente');
  
  if (!facturas || facturas.length === 0) {
    console.log("No hay facturas pendientes para WTC.");
    return;
  }
  
  const toDelete = facturas.filter(f => f.referencia !== keepRef).map(f => f.id);
  const kept = facturas.find(f => f.referencia === keepRef);
  
  if (toDelete.length > 0) {
    const { error } = await supabase.from('facturas').delete().in('id', toDelete);
    if (error) {
      console.error("Error al borrar:", error);
      return;
    }
    console.log(`Se eliminaron ${toDelete.length} facturas duplicadas.`);
  }
  
  if (kept) {
    console.log(`Factura conservada: ${kept.referencia} | Monto: Bs. ${Number(kept.monto).toLocaleString('es-VE')}`);
  } else {
    console.log(`No se encontró la factura ${keepRef} para conservar.`);
  }
}

run();
