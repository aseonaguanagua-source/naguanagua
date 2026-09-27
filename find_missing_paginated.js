require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log('Fetching all from Supabase...');
  let allConts = [];
  let from = 0;
  const step = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('contribuyentes')
      .select('identidad')
      .range(from, from + step - 1);
      
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    
    allConts = allConts.concat(data);
    from += step;
  }
  
  console.log(`Fetched ${allConts.length} users from DB.`);
  const dbIds = new Set(allConts.map(c => c.identidad.replace(/\\D/g, '')));

  console.log('Reading Excel...');
  const file = '/Users/davidzara/Documents/naguanagua_zero/bd naguanagua/Record de deudas - 20260924180506.xlsx';
  const wb = xlsx.readFile(file);
  const ws = wb.Sheets['Record de deudas'];
  const data = xlsx.utils.sheet_to_json(ws, { raw: false, header: 1 });
  
  const missing = [];
  for (let i=1; i<data.length; i++) {
    const row = data[i];
    if (!row || !row[2]) continue;
    const doc = row[2].toString().replace(/\\D/g, '');
    if (!dbIds.has(doc)) {
      missing.push(row);
    }
  }

  console.log(`Found ${missing.length} missing users!`);
  if (missing.length > 0) {
    console.log('First 5 missing:', missing.slice(0, 5).map(r => r[2] + ' - ' + r[3]));
  }
}
run();
