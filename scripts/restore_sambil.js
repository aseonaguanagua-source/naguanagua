const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function restoreSambil() {
  // 1. Restaurar multa del Sambil
  const { error: e1 } = await sb.from('inmuebles').update({ multa_bs: 21500000 }).eq('inmueble', 'URB016119');
  if (e1) console.error("Error updating Sambil multa:", e1);
  else console.log("Restored Sambil multa to 21.5M Bs");

  // 2. Restaurar actividades de las unidades
  let oldData = {};
  try {
    oldData = JSON.parse(fs.readFileSync('scratch/sambil_activities_old.json', 'utf8'));
  } catch (err) {
    console.error("Could not read sambil_activities_old.json");
    return;
  }

  let count = 0;
  for (const [code, activities] of Object.entries(oldData)) {
    if (!activities || activities.length === 0) continue;
    // Las actividades estaban en un array. Tomamos la primera como principal
    const mainAct = activities[0];
    
    // Update condominio_unidades
    await sb.from('condominio_unidades').update({ actividad: mainAct }).eq('inmueble', code);
    
    // Update inmuebles
    await sb.from('inmuebles').update({ actividad_principal: mainAct }).eq('inmueble', code);
    
    count++;
  }
  console.log(`Restored structure/activities for ${count} Sambil units`);
}
restoreSambil();
