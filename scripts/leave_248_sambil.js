const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixSambil() {
  const sambilCondoId = '7567ec01-6d34-4341-bc5b-5a69c64cba93';

  // Get all units
  const { data: units } = await sb.from('condominio_unidades').select('id, inmueble, created_at').eq('condominio_id', sambilCondoId);
  console.log(`Total Sambil units currently: ${units.length}`);
  
  // Sort by created_at desc (newest first)
  units.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  // The user says "deja solo las 248 unidades del sambil las otras no"
  // Assuming the 248 are the ones added today.
  const todayStr = new Date().toISOString().substring(0, 10);
  const newUnits = units.filter(u => u.created_at.startsWith(todayStr));
  
  console.log(`Units created today (should be 248): ${newUnits.length}`);
  
  const oldUnits = units.filter(u => !u.created_at.startsWith(todayStr));
  console.log(`Units to remove: ${oldUnits.length}`);
  
  if (oldUnits.length > 0) {
    const idsToRemove = oldUnits.map(u => u.id);
    const { error } = await sb.from('condominio_unidades').delete().in('id', idsToRemove);
    if (error) console.log("Error deleting:", error);
    else {
      console.log(`Deleted ${idsToRemove.length} old units from Sambil!`);
      await sb.from('condominios').update({ cant_declarada: newUnits.length }).eq('id', sambilCondoId);
    }
  }
}
fixSambil();
