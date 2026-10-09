require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condominios } = await supabase.from('condominios').select('id, nombre, codigo');
  for (const c of condominios) {
    const { count } = await supabase.from('condominio_unidades').select('*', { count: 'exact', head: true }).eq('condominio_id', c.id);
    if (count > 200) {
      console.log(`${c.codigo} | ${c.nombre} | ${count} unidades`);
    }
  }
}
run();
