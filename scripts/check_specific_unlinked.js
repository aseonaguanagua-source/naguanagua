const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function check() {
  const rifs = ['J-504089044', 'J-317418301', 'J-413013410', 'J-308012874'];
  const { data } = await supabase.from('inmuebles').select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, estado, padre_id').in('identidad', rifs);
  
  for (const r of rifs) {
    console.log('=== RIF:', r, '===');
    const items = data.filter(i => i.identidad === r);
    items.forEach(i => console.log('  [' + i.estado + '] ' + i.inmueble + ' - ' + i.actividad_principal + ' - Padre: ' + i.padre_id + ' - Dir: ' + i.direccion));
  }
}
check();
