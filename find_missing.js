require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching all from Supabase...');
  const { data: conts } = await supabase.from('contribuyentes').select('identidad');
  const dbIds = new Set(conts.map(c => c.identidad.replace(/-/g, '').trim().toUpperCase()));

  console.log('Reading Excel...');
  const file = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Record de deudas - 20260924180506.xlsx';
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Record de deudas'];
  const data = xlsx.utils.sheet_to_json(ws, { raw: false, header: 1 });
  
  // Header: id, Código, Documento, Nombre...
  const missing = [];
  // start from row 1 to skip header
  for (let i=1; i<data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;
    const doc = row[2].toString().replace(/-/g, '').trim().toUpperCase();
    if (!dbIds.has(doc)) {
      missing.push(row);
    }
  }

  console.log(`Found ${missing.length} missing users!`);
  if (missing.length > 0) {
    console.log('First 3 missing:', missing.slice(0, 3));
  }
}
run();
