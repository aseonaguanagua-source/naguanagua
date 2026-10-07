const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('siguientesCodigosInmueble');
  const { data, error } = await supabase
      .from('inmuebles')
      .select('inmueble')
      .like('inmueble', 'URB0%')
      .lt('inmueble', 'URB099000')
      .order('inmueble', { ascending: false })
      .limit(200);
  console.timeEnd('siguientesCodigosInmueble');
  if (error) console.error(error);
  else console.log(`Found ${data.length} records, max:`, data[0]?.inmueble);
  
  console.time('update_contacto');
  const { error: err2 } = await supabase.from('inmuebles').update({telefono: '123'}).eq('identidad', 'V-00000000');
  console.timeEnd('update_contacto');
  if (err2) console.error(err2);
}
test();
