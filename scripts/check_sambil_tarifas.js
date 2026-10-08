const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTarifas() {
  const ids = ['URB016127', 'URB035221', 'URB035219', 'URB016120', 'URB035215', 'URB016226'];
  const { data } = await sb.from('inmuebles').select('inmueble, actividad_principal, tarifa_id, nombre, metraje').in('inmueble', ids);
  
  for (const row of data) {
    if (row.tarifa_id) {
      const { data: tarifa } = await sb.from('tarifas').select('*').eq('id', row.tarifa_id).single();
      console.log(row.inmueble, row.actividad_principal, "Tarifa UCD:", tarifa ? tarifa.monto_ucd : 'None', "Metraje:", row.metraje);
    } else {
      console.log(row.inmueble, row.actividad_principal, "NO TARIFA_ID", "Metraje:", row.metraje);
    }
  }
}
checkTarifas();
