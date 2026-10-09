require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: eliminadas } = await supabase.from('condominio_unidades').select('id, propietario, condominio_id').eq('estado', 'Eliminada');
  
  const toReactivate = eliminadas.filter(u => {
    const prop = u.propietario ? u.propietario.toUpperCase() : '';
    return !prop.includes('HMR') && !prop.includes('HESPERIA');
  });
  
  console.log(`Reactivating ${toReactivate.length} units globally...`);
  
  const ids = toReactivate.map(u => u.id);
  
  // Batch updates in groups of 50 to avoid any limits
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { error } = await supabase.from('condominio_unidades').update({ estado: 'Activa' }).in('id', batch);
    if (error) {
      console.error("Error updating batch", error);
    }
  }
  
  console.log("Global reactivation complete.");
}
run();
