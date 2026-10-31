const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m);
    const serviceKeyMatch = envContent.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m);
    const anonKeyMatch = envContent.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m);
    if (urlMatch && !SUPABASE_URL) SUPABASE_URL = urlMatch[1].trim();
    if (serviceKeyMatch) SUPABASE_KEY = serviceKeyMatch[1].trim();
    else if (anonKeyMatch && !SUPABASE_KEY) SUPABASE_KEY = anonKeyMatch[1].trim();
  } catch (e) {
    console.warn('No se pudo leer .env.local:', e.message);
  }
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error crítico: Faltan credenciales de Supabase.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setMmvMes() {
  const rootDir = path.resolve(__dirname, '../..');
  const excelPath = path.join(rootDir, 'DATA NAGUANAGUA.xlsx');

  if (!fs.existsSync(excelPath)) {
    console.error(`Error: No se encontró el archivo Excel en ${excelPath}`);
    process.exit(1);
  }

  const wb1 = xlsx.readFile(excelPath);
  const data1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);

  let successCount = 0;
  let errorCount = 0;
  const tcmmv_estimado = parseFloat(process.env.TCMMV_ESTIMADO || '875.22');

  if (isNaN(tcmmv_estimado) || tcmmv_estimado <= 0) {
    console.error('Error: TCMMV_ESTIMADO inválido.');
    process.exit(1);
  }

  const operations = [];
  for (const row of data1) {
    const codigo = (row['Código'] || '').toString().trim();
    const rif = (row['Documento'] || codigo).toString().trim();
    if (!codigo && !rif) continue;

    const montoXmes = parseFloat(row['Monto x mes'] || 0);
    if (isNaN(montoXmes) || montoXmes <= 0) continue;

    const mmv_calculado = parseFloat((montoXmes / tcmmv_estimado).toFixed(4));
    if (mmv_calculado > 0) {
      operations.push({ codigo, rif, mmv_mes: mmv_calculado });
    }
  }

  console.log(`Actualizando mmv_mes de ${operations.length} inmuebles válidos (de ${data1.length} filas leídas)...`);

  const BATCH_SIZE = 50;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    const batch = operations.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (op) => {
        // Priorizar filtro por código único del inmueble ('inmueble') para no sobrescribir
        // otros inmuebles del mismo propietario ('identidad')
        let query = supabase.from('inmuebles').update({ mmv_mes: op.mmv_mes });
        if (op.codigo) {
          query = query.eq('inmueble', op.codigo);
        } else {
          query = query.eq('identidad', op.rif);
        }

        const { error } = await query;
        if (!error) {
          successCount++;
        } else {
          errorCount++;
          console.error(`\nError actualizando ${op.codigo || op.rif}: ${error.message}`);
        }
      })
    );
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= operations.length) {
      process.stdout.write(`.${successCount}`);
    }
  }

  console.log(`\n¡Se actualizaron las tarifas (mmv_mes) de ${successCount} inmuebles (${errorCount} errores) basados en el Monto x mes de DATA NAGUANAGUA!`);
  if (errorCount > 0) process.exitCode = 1;
}

setMmvMes().catch(err => {
  console.error('Error crítico en setMmvMes:', err);
  process.exit(1);
});
