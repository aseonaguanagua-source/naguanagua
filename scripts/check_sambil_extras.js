const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findExtraUnits() {
  const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
  const sheetName = workbook.SheetNames[2]; // Hoja 3
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const excelIds = new Set();
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (row && row.length >= 1 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
      excelIds.add(row[0]);
    }
  }

  const { data: condo } = await sb.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await sb.from('condominio_unidades').select('inmueble, id').eq('condominio_id', condo.id);
  
  const extraUnits = [];
  for (const u of units) {
    if (!excelIds.has(u.inmueble) && u.inmueble !== 'URB016119-AJUSTE') {
      extraUnits.push(u.inmueble);
    }
  }

  console.log(`Excel has ${excelIds.size} units.`);
  console.log(`DB has ${units.length} units.`);
  console.log(`Found ${extraUnits.length} extra units in DB:`);
  console.log(extraUnits);
}

findExtraUnits();
