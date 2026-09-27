const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const p = { identidad: '19109082' };
  const docTypeState = 'V';
  
  const idLimpio = p.identidad.replace(/-/g, '').toUpperCase();
  const docType = docTypeState.toUpperCase();
  const fullDoc = `${docType}-${idLimpio}`;
  const fullDocDash = `${docType}${idLimpio}`;
  
  const { data: inmsDB } = await supabase
    .from('inmuebles')
    .select('*')
    .or(`identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`);
    
  console.log("inmsDB", inmsDB);
}
check();
