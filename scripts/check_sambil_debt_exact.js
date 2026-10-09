require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // First, find Sambil's RIF from contribuyentes table
  const { data: contribs } = await supabase.from('contribuyentes')
    .select('identidad, razon_social')
    .ilike('razon_social', '%SAMBIL%');
    
  console.log('Contribuyentes encontrados:', contribs);
  
  if (!contribs || contribs.length === 0) {
    console.log('No se encontró a Sambil en contribuyentes.');
    return;
  }
  
  const sambilRifs = contribs.map(c => c.identidad);
  
  // Now get all properties for Sambil
  const { data: allProps } = await supabase.from('inmuebles')
    .select('inmueble, estado')
    .in('identidad', sambilRifs);
    
  console.log(`Propiedades totales encontradas: ${allProps.length}`);
  
  let debtActiva = 0;
  let debtInactiva = 0;
  
  // Loop properties and fetch recs
  for (const p of allProps) {
    const { data: recs } = await supabase.from('recibos')
      .select('monto_total')
      .eq('inmueble', p.inmueble)
      .eq('estado_pago', 'No Pagado');
      
    if (recs) {
      const pDebt = recs.reduce((acc, r) => acc + Number(r.monto_total), 0);
      if (p.estado === 'Activo') debtActiva += pDebt;
      else debtInactiva += pDebt;
    }
  }
  
  console.log(`\n=== DEUDA DE SAMBIL ===`);
  console.log(`Deuda Activa (Caja): Bs. ${debtActiva.toLocaleString('es-VE')}`);
  console.log(`Deuda Oculta (Inactivas): Bs. ${debtInactiva.toLocaleString('es-VE')}`);
  console.log(`Total Histórico (si estuviera todo activo): Bs. ${(debtActiva + debtInactiva).toLocaleString('es-VE')}`);
}

run();
