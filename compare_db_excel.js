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

async function run() {
  console.log("Reading Excel file...");
  const wb = xlsx.readFile('/Users/davidzara/Downloads/Record de deudas - 20260924180506.xlsx');
  const dataSheet = xlsx.utils.sheet_to_json(wb.Sheets['Record de deudas'], { header: 1 });
  
  // Create a map from the Excel data
  // Columns: [id, Codigo, Documento, Nombre, Dir, Telefono, Actividad, Uso, Tipo, Agente, Meses, UltimoMes, MontoMes, Deuda, Multa, Total]
  const excelData = new Map();
  let validRows = 0;
  for (let i = 1; i < dataSheet.length; i++) {
    const row = dataSheet[i];
    if (row && row.length > 1 && row[1]) {
      const codigo = String(row[1]).trim();
      const meses = parseInt(row[10]) || 0;
      const deudaTotal = parseFloat(row[13]) || 0;
      const agente = String(row[9] || '').toUpperCase() === 'SI' || String(row[9] || '').toUpperCase() === 'SÍ';
      excelData.set(codigo, { meses, deudaTotal, agente, rowNum: i + 1 });
      validRows++;
    }
  }
  console.log(`Found ${validRows} valid rows in Excel.`);

  console.log("Fetching database records...");
  let allInmuebles = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('inmueble, meses_deuda, deuda_mmv, deuda_congelada_bs, agente_retencion')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) {
      console.error("Error fetching data:", error);
      break;
    }
    
    if (data.length === 0) break;
    allInmuebles = allInmuebles.concat(data);
    page++;
  }
  
  console.log(`Fetched ${allInmuebles.length} records from DB.`);
  
  let matchMeses = 0;
  let mismatchMeses = 0;
  let missingInExcel = 0;
  let missingInDb = 0;
  
  let discrepancies = [];

  for (const dbInm of allInmuebles) {
    const cod = dbInm.inmueble;
    if (!cod) continue;
    
    const exData = excelData.get(cod);
    if (!exData) {
      missingInExcel++;
      continue;
    }
    
    const dbMeses = dbInm.meses_deuda || 0;
    if (dbMeses === exData.meses) {
      matchMeses++;
    } else {
      mismatchMeses++;
      if (discrepancies.length < 20) {
         discrepancies.push({
           codigo: cod,
           dbMeses,
           excelMeses: exData.meses
         });
      }
    }
    
    // Remove from map to track what's missing in DB
    excelData.delete(cod);
  }
  
  missingInDb = excelData.size;
  
  console.log("\n=== SUMMARY OF COMPARISON ===");
  console.log(`Total DB Records matched to Excel: ${matchMeses + mismatchMeses}`);
  console.log(`✅ MATCHING 'meses_deuda': ${matchMeses}`);
  console.log(`❌ MISMATCHING 'meses_deuda': ${mismatchMeses}`);
  console.log(`⚠️ Records in DB but missing in Excel: ${missingInExcel}`);
  console.log(`⚠️ Records in Excel but missing in DB: ${missingInDb}`);
  
  if (mismatchMeses > 0) {
    console.log("\nSample mismatches (up to 20):");
    console.table(discrepancies);
  }
}

run().catch(console.error);
