require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: updated } = await supabase.from('condominio_unidades').select('id').eq('condominio_id', condo.id).gte('updated_at', '2026-10-09T20:30:00Z');
  
  const ids = updated.map(u => u.id);
  
  // Revert back to Eliminada
  const { error } = await supabase.from('condominio_unidades').update({ estado: 'Eliminada' }).in('id', ids);
  
  if (error) console.error(error);
  else console.log(`Reverted ${ids.length} units in Sambil back to Eliminada.`);
}
run();
