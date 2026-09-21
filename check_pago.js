const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('facturas').select('*').eq('referencia', 'CM-C-000023-09-2026');
  console.log(data);
  const { data: pData, error: pErr } = await supabase.from('pagos_reportados').select('*').eq('identidad', 'J-299082686').order('created_at', { ascending: false }).limit(3);
  console.log("Pagos:", pData);
}

run();
