const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('upsert_contribuyente');
  const contribRecord = {
    identidad: 'V-00000000',
    nombre: 'TEST TIMEOUT',
    telefono: '123',
    email: 'test@test.com',
    direccion: 'TEST'
  };
  const { error: errC } = await supabase.from('contribuyentes').upsert([contribRecord], { onConflict: 'identidad' });
  console.timeEnd('upsert_contribuyente');
  if (errC) console.error(errC);
}
test();
