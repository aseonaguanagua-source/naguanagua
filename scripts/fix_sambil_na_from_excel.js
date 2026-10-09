const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixNA() {
  const excelData = JSON.parse(fs.readFileSync('scratch/sambil_master_excel.json', 'utf8'));
  
  const sambilCondoId = '7567ec01-6d34-4341-bc5b-5a69c64cba93';
  const { data, error } = await sb.from('condominio_unidades').select('inmueble, actividad').eq('condominio_id', sambilCondoId);
  const na = data.filter(d => !d.actividad || d.actividad === 'N/A');
  
  let fixed = 0;
  for (const unit of na) {
    // Find in excel
    const excelRow = excelData.find(r => r['Código Hijo'] === unit.inmueble || r['Nro. Inmueble'] === unit.inmueble || JSON.stringify(r).includes(unit.inmueble));
    if (excelRow && excelRow['Actividad Económica']) {
      const act = excelRow['Actividad Económica'];
      if (act && act !== 'N/A') {
        console.log(`Fixing ${unit.inmueble} -> ${act}`);
        await sb.from('condominio_unidades').update({ actividad: act }).eq('inmueble', unit.inmueble);
        await sb.from('inmuebles').update({ actividad_principal: act }).eq('inmueble', unit.inmueble);
        fixed++;
      }
    }
  }
  console.log(`Fixed ${fixed} out of ${na.length} N/A units using Excel backup.`);
}
fixNA();
