require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: recs, error } = await supabase.rpc('sum_total_debt');
  
  if (error) {
    // Fallback if no RPC
    let totalActiva = 0;
    
    // Solo propiedades activas
    const { data: activeProps } = await supabase.from('inmuebles').select('inmueble').eq('estado', 'Activo');
    const activeInmuebles = activeProps.map(p => p.inmueble);
    
    // We have to batch this due to URL length limits
    console.log(`Calculando deuda para ${activeInmuebles.length} inmuebles activos...`);
    
    let sum = 0;
    for(let i=0; i<activeInmuebles.length; i+=500) {
      const batch = activeInmuebles.slice(i, i+500);
      const { data } = await supabase.from('recibos')
        .select('monto_total')
        .in('inmueble', batch)
        .eq('estado_pago', 'No Pagado');
      
      if (data) {
        sum += data.reduce((acc, r) => acc + Number(r.monto_total), 0);
      }
    }
    
    console.log(`\nDeuda Total del Municipio (Propiedades Activas): Bs. ${sum.toLocaleString('es-VE')}`);
    return;
  }
  
  console.log(recs);
}

run();
