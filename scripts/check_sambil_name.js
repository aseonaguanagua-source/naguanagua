require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: allProps, error } = await supabase.from('inmuebles').select('identidad, inmueble, tipo, actividad_principal, estado, contribuyente').ilike('contribuyente', '%SAMBIL%');
  
  if (error) { console.error(error); return; }
  
  console.log(`\n=== REPORTE SAMBIL (POR NOMBRE) ===`);
  console.log(`Encontramos ${allProps.length} propiedades con la palabra SAMBIL en su nombre.`);
  
  const inactives = allProps.filter(p => p.estado === 'Inactivo');
  const actives = allProps.filter(p => p.estado === 'Activo');
  
  console.log(`Propiedades Activas: ${actives.length}`);
  console.log(`Propiedades Inactivas: ${inactives.length}`);
  
  let totalDebt = 0;
  for (const p of actives) {
    const { data: recs } = await supabase.from('recibos')
      .select('monto_total')
      .eq('inmueble', p.inmueble)
      .eq('estado_pago', 'No Pagado');
      
    if (recs && recs.length > 0) {
      totalDebt += recs.reduce((acc, r) => acc + Number(r.monto_total), 0);
    }
  }
  
  let inactiveDebt = 0;
  for (const p of inactives) {
    const { data: recs } = await supabase.from('recibos')
      .select('monto_total')
      .eq('inmueble', p.inmueble)
      .eq('estado_pago', 'No Pagado');
      
    if (recs && recs.length > 0) {
      inactiveDebt += recs.reduce((acc, r) => acc + Number(r.monto_total), 0);
    }
  }

  console.log(`\nDeuda Actual (Propiedades ACTIVAS): Bs. ${totalDebt.toLocaleString('es-VE')}`);
  console.log(`Deuda Oculta (Propiedades INACTIVAS): Bs. ${inactiveDebt.toLocaleString('es-VE')}`);
}

run();
