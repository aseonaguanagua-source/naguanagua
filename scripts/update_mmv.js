const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setMmvMes() {
  const rootDir = '/Users/davidzara/Documents/naguanagua_zero';
  const wb1 = xlsx.readFile(path.join(rootDir, 'DATA NAGUANAGUA.xlsx'));
  const data1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
  
  let successCount = 0;
  let tcmmv_estimado = 875.22; 

  console.log(`Actualizando mmv_mes de ${data1.length} inmuebles...`);
  
  for (const row of data1) {
      const codigo = (row['Código'] || '').toString().trim();
      const rif = (row['Documento'] || codigo).toString().trim();
      if (!rif) continue;
      
      let montoXmes = parseFloat(row['Monto x mes'] || 0);
      let mmv_calculado = montoXmes / tcmmv_estimado;

      if(mmv_calculado > 0) {
        const { error } = await supabase
          .from('inmuebles')
          .update({ mmv_mes: parseFloat(mmv_calculado.toFixed(4)) })
          .eq('identidad', rif);
        
        if (!error) {
            successCount++;
            if (successCount % 500 === 0) process.stdout.write(`.`);
        }
      }
  }
  
  console.log(`\n¡Se actualizaron las tarifas (mmv_mes) de ${successCount} inmuebles basados en el Monto x mes de DATA NAGUANAGUA!`);
}

setMmvMes();
