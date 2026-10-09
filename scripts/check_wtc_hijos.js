require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: wtcPadre } = await supabase.from('inmuebles').select('id, inmueble').eq('inmueble', 'URB018483').single();
  
  if (!wtcPadre) return;
  
  const { data: hijos } = await supabase.from('inmuebles').select('inmueble, estado, identidad').eq('condominio_padre_id', wtcPadre.inmueble);
  console.log(`Hijos del WTC (URB018483): ${hijos?.length}`);
  
  // What about facturas of the hijos?
  if (hijos && hijos.length > 0) {
    const rifsHijos = [...new Set(hijos.map(h => h.identidad))];
    const { data: facs } = await supabase.from('facturas').select('monto, identidad').in('identidad', rifsHijos).eq('estado', 'Pendiente');
    const totalHijos = (facs || []).reduce((acc, f) => acc + Number(f.monto), 0);
    console.log(`Facturas Pendientes de los hijos del WTC: Bs. ${totalHijos.toLocaleString('es-VE')}`);
  }
}
run();
