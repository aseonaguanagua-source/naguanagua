const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms2 } = await supabase.from('inmuebles').select('actividad_principal, mmv_mes').ilike('clasificacion', 'Residencial');
  
  if (inms2) {
    const counts = {};
    inms2.forEach(i => {
      const act = i.actividad_principal || 'NULL';
      if (!counts[act]) counts[act] = {};
      const m = i.mmv_mes;
      counts[act][m] = (counts[act][m] || 0) + 1;
    });
    console.log(counts);
  }
}
check();
