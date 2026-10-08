const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const xlsx = require('xlsx');

async function checkSyncedTotal() {
  const workbook = xlsx.readFile('/Users/davidzara/Downloads/Estado_de_cuenta_condominio_URB016119.xls');
  const sheetName = workbook.SheetNames[2]; // Hoja 3
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  const excelIds = [];
  for (let i = 6; i < data.length; i++) {
    const row = data[i];
    if (row && row.length >= 1 && typeof row[0] === 'string' && row[0].startsWith('URB')) {
      excelIds.push(row[0]);
    }
  }

  const { data: inms } = await sb.from('inmuebles').select('inmueble, deuda_mmv, meses_deuda').in('inmueble', excelIds);
  let totalMmv = 0;
  for (const i of inms) {
    totalMmv += i.deuda_mmv || 0;
  }
  console.log(`Synced 225 Total MMV: ${totalMmv}`);
  console.log(`Synced 225 Total Bs (approx): ${totalMmv * 55927.26}`);
}
checkSyncedTotal();
