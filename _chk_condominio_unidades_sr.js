const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.from('condominio_unidades').select('*').limit(5);
  if (error) console.error(error);
  else if (data && data.length > 0) console.log("Cols:", Object.keys(data[0]), "Sample:", data[0]);
  else console.log("condominio_unidades is empty!");
}
test();
