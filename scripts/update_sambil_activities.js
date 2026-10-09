const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateActivities() {
  const actsFile = 'scratch/sambil_activities_39gb.json';
  if (!fs.existsSync(actsFile)) {
    console.log("File not found!");
    return;
  }
  
  const activities = JSON.parse(fs.readFileSync(actsFile, 'utf8'));
  const codes = Object.keys(activities);
  
  console.log(`Loaded activities for ${codes.length} codes.`);
  
  for (const code of codes) {
    const actList = activities[code];
    if (actList && actList.length > 0) {
      const mainAct = actList[0];
      
      // Update condominio_unidades
      await sb.from('condominio_unidades').update({ actividad: mainAct }).eq('inmueble', code);
      // Update inmuebles
      await sb.from('inmuebles').update({ actividad_principal: mainAct }).eq('inmueble', code);
      
      console.log(`Updated ${code} -> ${mainAct}`);
    }
  }
  console.log("Done updating activities!");
}

updateActivities();
