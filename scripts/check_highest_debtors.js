require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Let's get all receipts and sum by inmueble
  let allRecs = [];
  let from = 0;
  let limit = 1000;
  
  while(true) {
    const { data, error } = await supabase.from('recibos')
      .select('inmueble, monto_total')
      .eq('estado_pago', 'No Pagado')
      .range(from, from + limit - 1);
      
    if (error || !data || data.length === 0) break;
    allRecs = allRecs.concat(data);
    from += limit;
  }
  
  const debtByProp = {};
  for(const r of allRecs) {
    if (!debtByProp[r.inmueble]) debtByProp[r.inmueble] = 0;
    debtByProp[r.inmueble] += Number(r.monto_total);
  }
  
  // Now group by RIF
  const { data: props } = await supabase.from('inmuebles')
    .select('identidad, inmueble, contribuyente, estado');
    
  const debtByRif = {};
  let totalActiva = 0;
  let totalInactiva = 0;
  
  for(const p of props) {
    const pDebt = debtByProp[p.inmueble] || 0;
    if (pDebt > 0) {
      if (!debtByRif[p.identidad]) {
        debtByRif[p.identidad] = { name: p.contribuyente, activa: 0, inactiva: 0 };
      }
      if (p.estado === 'Activo') {
        debtByRif[p.identidad].activa += pDebt;
        totalActiva += pDebt;
      } else {
        debtByRif[p.identidad].inactiva += pDebt;
        totalInactiva += pDebt;
      }
    }
  }
  
  const rifs = Object.keys(debtByRif).map(rif => ({
    rif,
    name: debtByRif[rif].name,
    activa: debtByRif[rif].activa,
    inactiva: debtByRif[rif].inactiva,
    total: debtByRif[rif].activa + debtByRif[rif].inactiva
  })).sort((a,b) => b.total - a.total);
  
  console.log('--- MAYORES DEUDORES (TOP 10) ---');
  for(let i=0; i<10; i++) {
    const d = rifs[i];
    if (d) {
      console.log(`${d.rif} | ${d.name?.substring(0,30)} | Activa: ${d.activa.toLocaleString('es-VE')} | Inactiva: ${d.inactiva.toLocaleString('es-VE')}`);
    }
  }
  
  console.log(`\nDeuda Total Activa (Caja): Bs. ${totalActiva.toLocaleString('es-VE')}`);
  console.log(`Deuda Total Inactiva (Apagada): Bs. ${totalInactiva.toLocaleString('es-VE')}`);
  
  // Search Sambil
  const sambil = rifs.find(r => r.name && r.name.toUpperCase().includes('SAMBIL'));
  if (sambil) {
    console.log(`\nSAMBIL: ${sambil.rif} | ${sambil.name} | Activa: ${sambil.activa.toLocaleString('es-VE')} | Inactiva: ${sambil.inactiva.toLocaleString('es-VE')}`);
  }
}

run();
