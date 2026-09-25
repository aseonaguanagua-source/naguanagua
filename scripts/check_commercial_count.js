const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
async function check() {
  const { count } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true }).in('tipo', ['COMERCIAL', 'INDUSTRIAL', 'INSTITUCIONAL']);
  console.log('Total Comercial:', count);
}
check();
