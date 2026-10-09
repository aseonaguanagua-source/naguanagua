require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: updated } = await supabase.from('condominio_unidades').select('id, numero, propietario').eq('condominio_id', condo.id).gte('updated_at', '2026-10-09T20:30:00Z');
  console.log("Updated units in Sambil:", updated.length);
}
run();
