require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('inmuebles').select('id, inmueble, contribuyente, mmv_mes').gt('mmv_mes', 1000);
  console.log(data);
}
run();
