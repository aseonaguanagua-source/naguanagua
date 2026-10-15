import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const code = 'URB001833';
  const { data: inms } = await supabase.from('inmuebles').select('*').eq('condominio_padre_id', code);
  console.log("Children of URB001833:", inms?.length);
  if (inms && inms.length > 0) {
      console.log(inms.map(i => ({inm: i.inmueble, act: i.actividad_principal})));
  }
}
run();
