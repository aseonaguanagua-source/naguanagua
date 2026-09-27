const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!supabaseUrl || !supabaseKey){
  require('dotenv').config({ path: '.env.local' });
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: facturas } = await supabase
    .from('facturas')
    .select('*')
    .ilike('identidad', '%3386120%')
    .in('estado', ['Pendiente', 'Por Verificar']);
    
  console.log("Facturas para 3386120:");
  console.table(facturas.map(i => ({
    referencia: i.referencia,
    estado: i.estado,
    monto: i.monto
  })));
}
check();
