require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: c } = await supabase.from('condominios').select('*').ilike('nombre', '%sambil%');
  console.log("Condominios named sambil:", c);
  
  const { data: d } = await supabase.from('condominios').select('*').eq('codigo', 'URB018449');
  console.log("Condominio URB018449:", d);
}
run();
