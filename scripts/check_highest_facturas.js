require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  let allFacs = [];
  let from = 0;
  let limit = 1000;
  
  while(true) {
    const { data, error } = await supabase.from('facturas')
      .select('identidad, contribuyente, monto')
      .eq('estado', 'Pendiente')
      .range(from, from + limit - 1);
      
    if (error || !data || data.length === 0) break;
    allFacs = allFacs.concat(data);
    from += limit;
  }
  
  const debtByRif = {};
  for(const f of allFacs) {
    if (!debtByRif[f.identidad]) debtByRif[f.identidad] = { name: f.contribuyente, total: 0 };
    debtByRif[f.identidad].total += Number(f.monto);
  }
  
  const rifs = Object.keys(debtByRif).map(rif => ({
    rif,
    name: debtByRif[rif].name,
    total: debtByRif[rif].total
  })).sort((a,b) => b.total - a.total);
  
  console.log('--- MAYORES DEUDORES (FACTURAS) ---');
  for(let i=0; i<15; i++) {
    const d = rifs[i];
    if (d) {
      console.log(`${d.rif} | ${d.name?.substring(0,30)} | Total: Bs. ${d.total.toLocaleString('es-VE')}`);
    }
  }
  
  // Search Sambil specifically
  const sambil = rifs.filter(r => r.name && r.name.toUpperCase().includes('SAMBIL'));
  console.log('\n--- SAMBIL ENCONTRADO ---');
  sambil.forEach(s => console.log(`${s.rif} | ${s.name} | Total: Bs. ${s.total.toLocaleString('es-VE')}`));
}
run();
