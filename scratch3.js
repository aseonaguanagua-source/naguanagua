const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fix() {
  const { data, error } = await supabase
    .from('inmuebles')
    .update({
      clasificacion: 'Residencial',
      tipo: 'RESIDENCIAL',
      actividad_principal: '[CONDOMINIO] Quinta (Zona A)',
      mmv_mes: 1.06
    })
    .ilike('direccion', '%pie de monte%')
    .select('inmueble, direccion');
    
  if (error) console.error(error);
  console.log("Actualizados Pie de Monte:", data?.length);
}

fix();
