require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: sambilPadre } = await supabase.from('inmuebles').select('id, inmueble').eq('inmueble', 'URB015503').single();
  
  if (!sambilPadre) {
    console.log("No encontré el padre Sambil (URB015503)");
    return;
  }
  
  // Find children
  const { data: hijosByPadreId } = await supabase.from('inmuebles').select('inmueble, estado').eq('padre_id', sambilPadre.id);
  const { data: hijosByCondoId } = await supabase.from('inmuebles').select('inmueble, estado').eq('condominio_padre_id', sambilPadre.id);
  
  const allHijos = [...(hijosByPadreId || []), ...(hijosByCondoId || [])];
  
  console.log(`Hijos encontrados por ID: ${allHijos.length}`);
  
  // What if they are linked by direccion containing "SAMBIL"?
  const { data: byDir } = await supabase.from('inmuebles').select('inmueble, estado').ilike('direccion', '%SAMBIL%');
  console.log(`Hijos encontrados por dirección: ${byDir?.length}`);
  
  const propertiesToCheck = byDir || [];
  
  let deudaHijos = 0;
  for (const p of propertiesToCheck) {
    if (p.estado === 'Activo') {
      const { data: facs } = await supabase.from('facturas')
        .select('monto')
        .eq('inmueble_id', p.inmueble) // wait, facturas uses inmueble (which is a string URB... or ID?)
        .eq('estado', 'Pendiente');
        
      if (facs && facs.length > 0) {
        deudaHijos += facs.reduce((acc, f) => acc + Number(f.monto), 0);
      } else {
        // Also try 'identidad' or just search recibos since facturas doesn't have it?
        // Let's search facturas by contribuyente or something?
        // Let's look at how facturas are structured.
      }
    }
  }
  
  console.log(`Deuda de todos los locales que dicen SAMBIL en la dirección: Bs. ${deudaHijos.toLocaleString('es-VE')}`);
}

run();
