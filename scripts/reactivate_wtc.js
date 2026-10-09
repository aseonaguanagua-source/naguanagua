require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  const { data: eliminadas } = await supabase.from('condominio_unidades')
    .select('id, propietario, estado')
    .eq('condominio_id', condo.id)
    .eq('estado', 'Eliminada');
  
  // Filter out HMR and Hesperia
  const toReactivate = eliminadas.filter(u => {
    const prop = u.propietario ? u.propietario.toUpperCase() : '';
    return !prop.includes('HMR') && !prop.includes('HESPERIA');
  });
  
  console.log(`Reactivating ${toReactivate.length} units...`);
  
  const ids = toReactivate.map(u => u.id);
  const { error } = await supabase.from('condominio_unidades').update({ estado: 'Solvente' }).in('id', ids);
  
  if (error) console.error(error);
  else {
    toReactivate.forEach(u => console.log(`Reactivated: ${u.propietario}`));
  }
}
run();
