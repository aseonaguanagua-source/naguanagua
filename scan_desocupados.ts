import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('identidad, actividad_principal, deuda_mmv, clasificacion')
    .ilike('actividad_principal', '%desocupado%');
    
  if (error) {
    console.error(error);
  } else {
    console.log(`Found ${data.length} desocupados.`);
    console.log(data.slice(0, 5));
  }
}

run();
