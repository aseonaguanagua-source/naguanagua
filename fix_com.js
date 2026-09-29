const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fix() {
  const { data: updated, error } = await supabase
    .from('inmuebles')
    .update({ mmv_mes: 1.98 })
    .ilike('actividad_principal', '%INMUEBLES Y LOCALES DESOCUPADOS%')
    .neq('mmv_mes', 1.98)
    .select('id');
    
  if (error) console.error(error);
  console.log(`Updated INMUEBLES Y LOCALES DESOCUPADOS:`, updated?.length);
}
fix();
