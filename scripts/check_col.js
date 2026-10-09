import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { error } = await sb.from('condominios').select('multa_exonerada_hasta').limit(1);
  console.log(error ? error.message : 'COLUMN EXISTS');
}
run();
