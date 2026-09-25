require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('inmuebles').select('id, inmueble, actividad_economica_id, tipo').eq('inmueble', 'URB016363').single();
  console.log(data);
}
run();
