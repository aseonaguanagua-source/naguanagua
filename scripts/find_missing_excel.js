const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const xlsx = require('xlsx');

async function findMissingExcelUnits() {
  const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
  const sheetName = workbook.SheetNames[2]; // Hoja 3
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const excelIds = [];
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (row && row.length >= 12 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
      excelIds.push(row[0]);
    }
  }

  // Get all ids from DB
  let dbIds = new Set();
  let from = 0;
  while (true) {
    const { data: inms } = await sb.from('inmuebles').select('inmueble').in('inmueble', excelIds).range(from, from + 999);
    if (!inms || inms.length === 0) break;
    for (const i of inms) dbIds.add(i.inmueble);
    from += 1000;
  }

  const missing = [];
  for (const id of excelIds) {
    if (!dbIds.has(id)) {
      missing.push(id);
    }
  }
  
  console.log(`Excel IDs: ${excelIds.length}`);
  console.log(`Found in DB: ${dbIds.size}`);
  console.log(`Missing from DB: ${missing.length}`);
  if (missing.length > 0) console.log(missing);
}
findMissingExcelUnits();
