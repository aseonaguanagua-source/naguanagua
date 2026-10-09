require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: reactivated } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id).eq('estado', 'Activa');
  console.log("Total actives in Sambil:", reactivated.length);
}
run();
