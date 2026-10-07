const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambil() {
  const condoCode = 'URB016119'; // Sambil's code from the screenshot
  const { data: condo } = await sb.from('condominios').select('multa_meses').eq('codigo', condoCode).single();
  console.log('Condo multa_meses:', condo.multa_meses);

  const { data: unidades } = await sb.from('condominio_unidades').select('multa_meses').eq('condominio_id', 'a99a8965-0a56-42d6-ace2-386d3ad35fbc'); // whatever Sambil's ID is, let me just find it
}
checkSambil();
