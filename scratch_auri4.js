const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms2 } = await supabase.from('inmuebles').select('inmueble, mmv_mes, actividad_principal').ilike('actividad_principal', '%QUINTA (ZONA B)%');
  
  if (inms2) {
    const wrong = inms2.filter(i => i.mmv_mes !== 1.06);
    console.log("Wrong QUINTA (ZONA B):", wrong.length);
    console.log(wrong.slice(0, 10));
  }
}
check();
