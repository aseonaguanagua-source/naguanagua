const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching TCMMV...");
  const eurRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial', { cache: 'no-store' });
  const eurData = await eurRes.json();
  const tcmmv = eurData.promedio;
  console.log("TCMMV:", tcmmv);

  console.log("Fetching inmuebles from DB...");
  const { data: inmuebles, error: inmsErr } = await supabase.from('inmuebles').select('id, identidad, contribuyente, cod_cont, mmv_mes, cant_inmuebles');
  if (inmsErr) {
    console.error(inmsErr);
    return;
  }
  
  // Create a map for quick lookup
  const inmMap = new Map();
  // To handle multiple properties for the same taxpayer (e.g. Condominios might have multiple rows, or one principal)
  // Actually, we'll group them by identidad so we can update all their properties
  inmuebles.forEach(inm => {
    if (!inmMap.has(inm.identidad)) inmMap.set(inm.identidad, []);
    inmMap.get(inm.identidad).push(inm);
  });

  console.log("Deleting all Pendiente monthly bills (CM-)...");
  const { error: delErr } = await supabase
    .from('facturas')
    .delete()
    .eq('estado', 'Pendiente')
    .like('referencia', 'CM-%');
  if (delErr) {
    console.error("Error deleting old bills:", delErr);
    return;
  }
  console.log("Deleted old bills.");

  console.log("Reading Excel file...");
  const workbook = XLSX.readFile('C:\\Users\\david\\Desktop\\tucacas\\global_green_tucacas\\Reporte  inmuebles inscritos.xlsx');
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const currentMonth = 9;
  const currentYear = 2026;

  let facturasNuevas = [];
  const updatesInmuebles = []; // We will do upserts or updates one by one

  let processedCount = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const identidad = row['__EMPTY_1'];
    const mesSolventeRaw = row['__EMPTY_15'];

    if (!identidad) continue;

    const inms = inmMap.get(identidad);
    if (!inms || inms.length === 0) continue;

    let solvMonth = currentMonth; // Default to current so they owe 0
    let solvYear = currentYear;

    if (mesSolventeRaw) {
      const match = mesSolventeRaw.toString().match(/(\d{1,2})\s*-\s*(\d{4})/);
      if (match) {
        solvMonth = parseInt(match[1]);
        solvYear = parseInt(match[2]);
      }
    }

    let monthsOwed = (currentYear - solvYear) * 12 + (currentMonth - solvMonth);
    if (monthsOwed < 0) monthsOwed = 0;

    let totalDeudaMmv = 0;

    // For each property of this taxpayer
    for (const inm of inms) {
      const cant = parseFloat(inm.cant_inmuebles) || 1;
      const mmv = parseFloat(inm.mmv_mes) || 0;
      
      const propertyDeuda = monthsOwed * (cant * mmv);
      totalDeudaMmv += propertyDeuda;

      // Generate missing bills
      for (let m = 1; m <= monthsOwed; m++) {
        let billMonth = solvMonth + m;
        let billYear = solvYear;
        
        // Adjust if months exceed 12
        while (billMonth > 12) {
          billMonth -= 12;
          billYear += 1;
        }

        const billMonthStr = billMonth.toString().padStart(2, '0');
        const periodoKey = `${billMonthStr}-${billYear}`;
        const refFactura = `CM-${inm.cod_cont}-${periodoKey}`;
        const montoCalculado = (cant * mmv * tcmmv).toFixed(2);
        
        // Emision date will just be the first of that bill month, or today
        // For simplicity, let's set emision to the first of the billed month
        const emisionDate = `${billYear}-${billMonthStr}-01`;
        
        // Find last day of the billed month
        const nextMonth = billMonth === 12 ? 1 : billMonth + 1;
        const nextMonthYear = billMonth === 12 ? billYear + 1 : billYear;
        const lastDayObj = new Date(nextMonthYear, nextMonth - 1, 0);
        const vencimientoDate = `${billYear}-${billMonthStr}-${lastDayObj.getDate().toString().padStart(2, '0')}`;

        facturasNuevas.push({
          referencia: refFactura,
          identidad: inm.identidad,
          contribuyente: inm.contribuyente,
          monto: montoCalculado,
          emision: emisionDate,
          vencimiento: vencimientoDate,
          estado: 'Pendiente'
        });
      }
      
      // Add to updates
      updatesInmuebles.push({
        id: inm.id,
        deuda_mmv: propertyDeuda
      });
    }

    processedCount++;
  }

  console.log(`Processed ${processedCount} taxpayers. Generating ${facturasNuevas.length} bills.`);

  // Insert Facturas in chunks
  const chunkSize = 500;
  for (let i = 0; i < facturasNuevas.length; i += chunkSize) {
    const chunk = facturasNuevas.slice(i, i + chunkSize);
    const { error: insErr } = await supabase.from('facturas').upsert(chunk, { onConflict: 'referencia', ignoreDuplicates: true });
    if (insErr) {
      console.error("Error inserting facturas chunk:", insErr);
    }
  }
  console.log("Finished inserting facturas.");

  // Update Inmuebles
  console.log(`Updating deuda_mmv for ${updatesInmuebles.length} properties...`);
  // Since Supabase doesn't easily support bulk update of different values without a stored procedure,
  // we can just upsert the whole objects if we had them all, but we only have id and deuda_mmv.
  // Wait, upserting just id and deuda_mmv will NULL the other columns!
  // So we MUST use update() in a loop, or upsert the fully populated objects.
  
  // It's safer to loop update since it's only ~645 records
  let updateErrCount = 0;
  for (const upd of updatesInmuebles) {
    const { error } = await supabase.from('inmuebles').update({ deuda_mmv: upd.deuda_mmv }).eq('id', upd.id);
    if (error) {
      console.error("Error updating inmueble ID", upd.id, error);
      updateErrCount++;
    }
  }

  console.log(`Finished updating inmuebles. Errors: ${updateErrCount}`);
  console.log("DONE!");
}

run();
