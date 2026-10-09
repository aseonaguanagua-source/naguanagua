require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: wtc } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  
  // Find all units updated globally since my script ran, excluding WTC
  const { data: updated } = await supabase.from('condominio_unidades')
    .select('id')
    .neq('condominio_id', wtc.id)
    .gte('updated_at', '2026-10-09T20:30:00Z')
    .eq('estado', 'Activa'); // Because my script set them to Activa
    
  if (updated.length > 0) {
    const ids = updated.map(u => u.id);
    const { error } = await supabase.from('condominio_unidades').update({ estado: 'Eliminada' }).in('id', ids);
    if (error) console.error(error);
    else console.log(`Reverted ${ids.length} units globally back to Eliminada!`);
  } else {
    console.log("No other units need reverting.");
  }
}
run();
