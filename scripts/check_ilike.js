const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function check() {
  const { count: cIlike } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true }).ilike('actividad_principal', '%[HIJO_DE:URB016119]%');
  console.log('ilike count:', cIlike);
  
  const { count: cLike } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true }).like('actividad_principal', '%[HIJO_DE:URB016119]%');
  console.log('like count:', cLike);
}
check();
