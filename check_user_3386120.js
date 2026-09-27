const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!supabaseUrl || !supabaseKey){
  require('dotenv').config({ path: '.env.local' });
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: user } = await supabase
    .from('contribuyentes')
    .select('*')
    .ilike('identidad', '%3386120%');
    
  console.log("Contribuyente 3386120:");
  console.table(user.map(i => ({
    Identidad: i.identidad,
    Nombre: i.nombre,
    Actividad: i.actividad
  })));
  
  const { data: user2 } = await supabase
    .from('inmuebles')
    .select('*')
    .ilike('identidad', '%3386120%');
    
  console.table(user2.map(i => ({
    Contribuyente: i.contribuyente,
    Actividad: i.actividad_principal,
    Condominio: i.condominio,
    es_condominio: i.es_condominio
  })));
}
check();
