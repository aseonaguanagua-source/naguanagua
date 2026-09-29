const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function search() {
  const { data, error } = await supabase
    .from('inmuebles')
    .select('*')
    .eq('es_condominio', true);
    
  if (error) console.error(error);
  if (data) {
    const wrongCondos = data.filter(d => 
      (d.clasificacion || '').toLowerCase() === 'comercial' &&
      (
        (d.direccion || '').toLowerCase().includes('residencial') ||
        (d.direccion || '').toLowerCase().includes('residencia') ||
        (d.direccion || '').toLowerCase().includes('condominio res')
      )
    );
    console.log("Condominios Residenciales pero clasificados como Comercial:", wrongCondos.length);
    console.log(wrongCondos.map(w => ({ inmueble: w.inmueble, direccion: w.direccion, actividad: w.actividad_principal, mmv_mes: w.mmv_mes })));
  }
}

search();
