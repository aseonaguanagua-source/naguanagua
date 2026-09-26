const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper for FAR logic to perfectly match the frontend
const getFAR = (actividad) => {
  const act = (actividad || "").toLowerCase();
  if (act.includes("quinta (a)")) return 0.020366;
  if (act.includes("apartamento (a)")) return 0.023723;
  if (act.includes("quinta (b)")) return 0.016298;
  if (act.includes("apartamento (b)")) return 0.018985;
  if (act.includes("casa (c)")) return 0.014;
  if (act.includes("apartamento (c)")) return 0.028839;
  if (act.includes("casa (d)")) return 0.02673;
  return 0.02673;
};

// Estimated Euro rate used in the Excel
const EURO_RATE = 976.452;

async function run() {
  console.log("Reading Excel file...");
  const wb = xlsx.readFile('/Users/davidzara/Downloads/Record de deudas - 20260924180506.xlsx');
  const dataSheet = xlsx.utils.sheet_to_json(wb.Sheets['Record de deudas'], { header: 1 });
  
  const excelData = new Map();
  for (let i = 1; i < dataSheet.length; i++) {
    const row = dataSheet[i];
    if (row && row.length > 1 && row[1]) {
      const codigo = String(row[1]).trim();
      const meses = parseInt(row[10]) || 0;
      const montoMesVes = parseFloat(row[12]) || 0;
      const deudaTotalVes = parseFloat(row[13]) || 0;
      const multaVes = parseFloat(row[14]) || 0;
      excelData.set(codigo, { meses, montoMesVes, deudaTotalVes, multaVes });
    }
  }

  console.log(`Parsed ${excelData.size} properties from Excel.`);
  
  let page = 0;
  const pageSize = 1000;
  let allInmuebles = [];
  
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, clasificacion, actividad_principal, cant_inmuebles')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error || data.length === 0) break;
    allInmuebles = allInmuebles.concat(data);
    page++;
  }
  
  console.log(`Fetched ${allInmuebles.length} records from DB. Preparing updates...`);
  
  let updates = [];
  
  for (const dbInm of allInmuebles) {
    const cod = dbInm.inmueble;
    if (!cod) continue;
    const exData = excelData.get(cod);
    if (!exData) continue;
    
    const esRes = (dbInm.clasificacion || '').toLowerCase().includes('residencial');
    const cant = parseFloat(dbInm.cant_inmuebles || 1);
    
    // Reverse engineer mmv_mes and deuda_mmv
    let newMmvMes = 0;
    let newDeudaMmv = 0;
    
    const trueUcdMontoMes = exData.montoMesVes / EURO_RATE;
    const trueUcdDeudaTotal = exData.deudaTotalVes / EURO_RATE;

    if (esRes) {
      const far = getFAR(dbInm.actividad_principal);
      // monto_mes = cant * mmv * 57 * far * tcmmv
      newMmvMes = trueUcdMontoMes / (cant * 57 * far);
      // deuda_total = deuda_mmv * far * tcmmv
      newDeudaMmv = trueUcdDeudaTotal / far;
    } else {
      // Comercial
      // monto_mes = cant * mmv * 57 * tcmmv
      newMmvMes = trueUcdMontoMes / (cant * 57);
      // deuda_total = deuda_mmv * tcmmv
      newDeudaMmv = trueUcdDeudaTotal;
    }
    
    // Prevent NaNs or Infinity
    newMmvMes = isNaN(newMmvMes) || !isFinite(newMmvMes) ? 0 : parseFloat(newMmvMes.toFixed(4));
    newDeudaMmv = isNaN(newDeudaMmv) || !isFinite(newDeudaMmv) ? 0 : parseFloat(newDeudaMmv.toFixed(4));
    
    updates.push({
      id: dbInm.id,
      inmueble: cod,
      meses_deuda: exData.meses,
      mmv_mes: newMmvMes,
      deuda_mmv: newDeudaMmv,
      multa_bs: exData.multaVes // Exact multa
    });
  }
  
  console.log(`Ready to update ${updates.length} records. Committing in batches...`);
  
  const batchSize = 250;
  let successCount = 0;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const { error } = await supabase.from('inmuebles').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`Error in batch ${i/batchSize}:`, error);
    } else {
      successCount += batch.length;
      process.stdout.write(`\rUpdated ${successCount}/${updates.length} records`);
    }
  }
  console.log("\nFinished updating database.");
}

run().catch(console.error);
