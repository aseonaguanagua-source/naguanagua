const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const types = [
  { term: '%QUINTA (ZONA A)%', val: 1.06 },
  { term: '%QUINTA (ZONA B)%', val: 1.06 },
  { term: '%APARTAMENTO (ZONA B)%', val: 0.91 },
  { term: '%CASA (ZONA C)%', val: 0.618 },
  { term: '%APARTAMENTO (ZONA C)%', val: 0.3 },
  { term: '%CASA (ZONA D)%', val: 0.22 }
];

async function check() {
  for (const t of types) {
    const { data: updated, error } = await supabase
      .from('inmuebles')
      .update({ mmv_mes: t.val })
      .ilike('actividad_principal', t.term)
      .neq('mmv_mes', t.val)
      .select('id');
      
    if (error) console.error(error);
    console.log(`Updated ${t.term}:`, updated?.length);
  }
}
check();
