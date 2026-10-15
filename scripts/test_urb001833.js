import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const code = 'URB001833';
  const { data: inms, error } = await supabase.from('inmuebles').select('*').eq('inmueble', code);
  console.log("Inmuebles count:", inms?.length);
  console.log("Inmuebles activities:", inms?.map(i => ({
    id: i.id,
    inmueble: i.inmueble,
    codigo_actividad: i.codigo_actividad,
    actividad_principal: i.actividad_principal
  })));

  if (inms && inms.length > 0) {
    const ident = inms[0].identidad;
    const { data: contrib } = await supabase.from('contribuyentes').select('*').eq('identidad', ident);
    console.log("Contribuyente record:", contrib?.length ? contrib[0].actividad_principal : "none");
  }
}
run();
