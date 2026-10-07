require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: condo } = await sb.from('condominios').select('*').eq('codigo', 'URB004304').limit(1).maybeSingle();
  if (condo && condo.identidad) {
    const { data: inms } = await sb.from('inmuebles').select('inmueble, identidad, agente_retencion').eq('identidad', condo.identidad);
    console.log('Inmuebles para RIF del condominio:', inms);
  }
}
check().catch(console.error);
