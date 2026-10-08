import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await sb.from('condominios').select('*').eq('codigo', 'URB033271').single();
  console.log(error ? error.message : JSON.stringify(data, null, 2));
}
run();
