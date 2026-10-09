const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: naUsers, error } = await sb.from('inmuebles')
    .select('identidad, contribuyente, inmueble, actividad_principal')
    .or("actividad_principal.eq.N/A,actividad_principal.eq.")
    .or("tipo.ilike.%COMERCIAL%")
    .neq('estado', 'Eliminado');

  if (error) { console.log('Error:', error); return; }

  // Check the first 5 NA users
  for (let i = 0; i < 5; i++) {
    const u = naUsers[i];
    console.log(`\nUser: ${u.contribuyente} (${u.identidad}) - Inmueble NA: ${u.inmueble}`);
    const { data: props } = await sb.from('inmuebles')
       .select('inmueble, actividad_principal, tipo, clasificacion')
       .eq('identidad', u.identidad)
       .neq('estado', 'Eliminado');
       
    console.log(`Total active inmuebles for this user: ${props.length}`);
    for (const p of props) {
       console.log(`  - ${p.inmueble} | Tipo: ${p.tipo} | Clasificacion: ${p.clasificacion} | Actividad: ${p.actividad_principal}`);
    }
  }
}
run();
