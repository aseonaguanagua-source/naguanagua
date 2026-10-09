require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condominios } = await supabase.from('condominios').select('id, nombre').eq('nombre', 'N/A');
  
  if (!condominios) {
    console.log("No N/A condominios found.");
    return;
  }
  
  let emptyCount = 0;
  for (const c of condominios) {
    const { count } = await supabase.from('condominio_unidades').select('id', { count: 'exact', head: true }).eq('condominio_id', c.id);
    if (count === 0) {
      emptyCount++;
      await supabase.from('condominios').delete().eq('id', c.id);
    }
  }
  
  console.log(`Deleted ${emptyCount} empty 'N/A' condominios out of ${condominios.length} total 'N/A' condominios.`);
}
run();
