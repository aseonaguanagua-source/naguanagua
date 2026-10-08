const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findDiff() {
  const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
  const sheetName = workbook.SheetNames[2];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const TASA = 55927.2599;
  const excelDict = {};
  
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (row && row.length >= 12 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
      excelDict[row[0]] = parseFloat(row[7]) || 0;
    }
  }

  const { data: inms } = await sb.from('inmuebles').select('inmueble, deuda_mmv').in('inmueble', Object.keys(excelDict));
  
  let diffCount = 0;
  for (const i of inms) {
    const excelAseo = excelDict[i.inmueble];
    const dbAseo = (i.deuda_mmv || 0) * TASA;
    if (Math.abs(excelAseo - dbAseo) > 1) { // 1 Bs tolerance
      console.log(`Mismatch ${i.inmueble}: Excel=${excelAseo}, DB=${dbAseo}`);
      diffCount++;
    }
  }
  console.log(`Found ${diffCount} mismatched units.`);
}
findDiff();
