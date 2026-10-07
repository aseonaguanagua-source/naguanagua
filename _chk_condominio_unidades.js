const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('condominio_unidades').select('*').limit(5);
  if (error) console.error(error);
  else if (data && data.length > 0) console.log("Cols:", Object.keys(data[0]), "Sample:", data[0]);
  else console.log("condominio_unidades is empty!");
  
  const { data: d2, error: e2 } = await supabase.from('inmuebles').select('*').not('condominio_padre_id', 'is', null).limit(5);
  if (d2 && d2.length > 0) console.log("Inmuebles hijos Cols:", Object.keys(d2[0]), "Sample:", d2[0]);
}
test();
