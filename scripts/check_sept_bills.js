const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function checkSeptBills() {
  console.log('Checking bills for September...');
  
  const { data, error, count } = await supabase
    .from('facturas')
    .select('*', { count: 'exact' })
    .like('referencia', '%-09-2026%');

  if (error) {
    console.error('Error fetching bills:', error);
    return;
  }
  
  console.log(`Found ${count} bills for 09-2026.`);
  
  if (count === 0) {
    console.log('No bills found for September. Generating them now using the logic from cron...');
    
    try {
      const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
      const eurData = await eurRes.json();
      const tcmmv = eurData.promedio;
      console.log('TCMMV:', tcmmv);
      
      const { data: inmuebles, error: inmError } = await supabase
        .from('inmuebles')
        .select('id, identidad, contribuyente, cod_cont, mmv_mes, cant_inmuebles, deuda_mmv')
        .gt('mmv_mes', 0);
        
      if (inmError) throw inmError;
      
      console.log(`Found ${inmuebles.length} active properties.`);
      
      const facturasNuevas = [];
      const periodoKey = '09-2026';
      const emisionDate = '2026-09-01';
      const vencimientoDate = '2026-09-30';
      const mesFacturado = 'septiembre de 2026';
      
      for (const inm of inmuebles) {
        if (!inm.cod_cont) continue;
        const cant = parseFloat(inm.cant_inmuebles) || 1;
        const mmv = parseFloat(inm.mmv_mes) || 0;
        if (mmv <= 0) continue;
        
        const refFactura = `CM-${inm.cod_cont}-${periodoKey}`;
        const deudaAgregadaBs = parseFloat((cant * mmv * tcmmv).toFixed(2));
        
        facturasNuevas.push({
          referencia: refFactura,
          identidad: inm.identidad,
          contribuyente: inm.contribuyente,
          monto: deudaAgregadaBs,
          estado: 'Pendiente',
          emision: emisionDate,
          vencimiento: vencimientoDate,
          mes_facturado: mesFacturado,
          created_at: new Date().toISOString()
        });
      }
      
      console.log(`Inserting ${facturasNuevas.length} new bills...`);
      
      const chunkSize = 100;
      for (let i = 0; i < facturasNuevas.length; i += chunkSize) {
        const chunk = facturasNuevas.slice(i, i + chunkSize);
        const { error: insertError } = await supabase.from('facturas').insert(chunk);
        if (insertError) {
          console.error(`Error inserting chunk ${i}:`, insertError);
        } else {
          console.log(`Inserted chunk ${i} to ${i + chunk.length}`);
        }
      }
      
      console.log('Done generating bills for September.');
    } catch (err) {
      console.error('Error generating bills:', err);
    }
  } else {
    console.log('Bills already exist. Showing a sample:');
    console.log(data.slice(0, 2));
  }
}

checkSeptBills();
