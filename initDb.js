
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: 'C:\\\\Users\\\\david\\\\Desktop\\\\tucacas\\\\global_green_tucacas\\.env.local' });

async function initDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // check if exists
  const { data } = await supabase.from('sistema_config').select('*').eq('id', 'tasa_bcv_semanal');
  if (!data || data.length === 0) {
    await supabase.from('sistema_config').insert({ id: 'tasa_bcv_semanal', valor: '0' });
    console.log('tasa_bcv_semanal created in DB');
  } else {
    console.log('tasa_bcv_semanal already exists in DB');
  }
}
initDb();
