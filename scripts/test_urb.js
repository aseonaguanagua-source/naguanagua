import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const code = 'URB001833';
  const { data: inms } = await supabase.from('inmuebles').select('identidad').eq('inmueble', code).limit(1);
  if (inms && inms.length > 0) {
    const ident = inms[0].identidad;
    console.log("Identidad:", ident);
    const { data: allInms } = await supabase.from('inmuebles').select('inmueble, actividad_principal').eq('identidad', ident);
    console.log("All inmuebles for user:", allInms);
    const { data: c } = await supabase.from('contribuyentes').select('*').eq('identidad', ident);
    console.log("Contribuyentes count:", c?.length);
  } else {
    console.log("Not found");
  }
}
run();
