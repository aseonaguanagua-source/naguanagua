require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('inmuebles').select('id, identidad, contribuyente, condominio_padre_id').ilike('contribuyente', '%SAMBIL%').limit(5);
  console.log(data);
}
run();
