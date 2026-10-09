import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await sb.from('condominio_unidades').update({ aseo_pendiente_desde: null }).limit(1).select();
  console.log('Error:', error);
  console.log('Data:', data);
}
main();
