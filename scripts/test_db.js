const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: d1 } = await sb.from('condominio_movimientos').select('*').eq('tipo', 'PAGO').eq('estado', 'Aprobado').limit(1);
  console.log('condominio_movimientos sample:', d1);
  
  const { data: d2 } = await sb.from('pagos_reportados').select('*').eq('estado', 'Aprobado').limit(1);
  console.log('pagos_reportados sample:', d2);
}
test();
