require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: hijos } = await supabase.from('inmuebles').select('inmueble, estado, identidad').eq('condominio_padre_id', 'URB018483');
  
  if (!hijos) return;
  const inactivos = hijos.filter(h => h.estado === 'Inactivo');
  const activos = hijos.filter(h => h.estado === 'Activo');
  
  console.log(`Hijos WTC Activos: ${activos.length}`);
  console.log(`Hijos WTC Inactivos: ${inactivos.length}`);
  
  // also get their debt
  const rifsInactivos = inactivos.map(h => h.identidad);
  if (rifsInactivos.length > 0) {
    const { data: facs } = await supabase.from('facturas').select('monto').in('identidad', rifsInactivos).eq('estado', 'Pendiente');
    const debtInactivos = (facs || []).reduce((acc, f) => acc + Number(f.monto), 0);
    console.log(`Deuda de los Inactivos: Bs. ${debtInactivos.toLocaleString('es-VE')}`);
  }
}

run();
