require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: wtcPadre } = await supabase.from('inmuebles').select('id, inmueble').eq('inmueble', 'URB018483').single();
  if (!wtcPadre) return;
  
  const { data: hijos } = await supabase.from('inmuebles').select('inmueble, estado, identidad, contribuyente').eq('condominio_padre_id', wtcPadre.inmueble);
  
  // get users from dump
  const dump = fs.readFileSync('sql/2026-10-07_inmuebles_licencia_nrolocal.sql', 'utf8');
  const userLines = dump.split('\n').filter(l => l.startsWith('INSERT INTO `users`'));
  
  const inactiveRifs = new Set();
  const activeRifs = new Set();
  
  userLines.forEach(line => {
    const match = line.match(/\((.*?)\)/g);
    if (match) {
      match.forEach(m => {
        const parts = m.substring(1, m.length - 1).split(',');
        const rif = parts[10] ? parts[10].replace(/'/g, '').trim() : null;
        const status = parts[14] ? parts[14].trim() : null;
        if (rif && status === '0') inactiveRifs.add(rif);
        if (rif && status === '1') activeRifs.add(rif);
      });
    }
  });
  
  let inactiveCount = 0;
  let activeCount = 0;
  let inactiveDebt = 0;
  let activeDebt = 0;
  
  for (const h of hijos) {
    const isInactive = inactiveRifs.has(h.identidad);
    
    // get their pending facturas
    const { data: facs } = await supabase.from('facturas').select('monto').eq('identidad', h.identidad).eq('estado', 'Pendiente');
    const debt = (facs || []).reduce((acc, f) => acc + Number(f.monto), 0);
    
    if (isInactive) {
      inactiveCount++;
      inactiveDebt += debt;
    } else {
      activeCount++;
      activeDebt += debt;
    }
  }
  
  console.log(`WTC Hijos: ${hijos.length}`);
  console.log(`Hijos inactivos (status=0): ${inactiveCount} | Deuda: Bs. ${inactiveDebt.toLocaleString('es-VE')}`);
  console.log(`Hijos activos: ${activeCount} | Deuda: Bs. ${activeDebt.toLocaleString('es-VE')}`);
  
  // WTC Padre debt
  const { data: facsPadre } = await supabase.from('facturas').select('monto').eq('identidad', 'J-312070412').eq('estado', 'Pendiente');
  const debtPadre = (facsPadre || []).reduce((acc, f) => acc + Number(f.monto), 0);
  console.log(`Deuda Padre WTC (J-312070412): Bs. ${debtPadre.toLocaleString('es-VE')}`);
}

run();
