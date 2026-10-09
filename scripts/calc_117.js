require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('*').eq('codigo', 'URB018483').single();
  const { data: unidades } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  let suma = 0;
  let activas = 0;
  let desocupadas = 0;
  let sumaActivas = 0;
  let sumaDesocupadas = 0;
  
  unidades.forEach(u => {
    if (u.estado === 'Activa') {
      activas++;
      sumaActivas += u.tarifa_mmv || 0;
      suma += u.tarifa_mmv || 0;
    } else if (u.estado === 'Desocupada') {
      desocupadas++;
      sumaDesocupadas += 1.98;
      suma += 1.98;
    } else {
      // Eliminada
      suma += u.tarifa_mmv || 0;
    }
  });
  
  const faltantes = condo.cant_declarada - unidades.length;
  
  console.log(`Unidades en DB: ${unidades.length} de ${condo.cant_declarada}`);
  console.log(`Activas: ${activas} (MMV: ${sumaActivas.toFixed(2)})`);
  console.log(`Desocupadas: ${desocupadas} (MMV: ${sumaDesocupadas.toFixed(2)})`);
  console.log(`Faltantes (1.98): ${faltantes} (MMV: ${(faltantes * 1.98).toFixed(2)})`);
  console.log(`Total calculado: ${(suma + (faltantes > 0 ? faltantes * 1.98 : 0)).toFixed(2)} UCD`);
}
run();
